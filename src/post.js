// #189: ONE FULLSCREEN PASS -- a vignette and a light grade, which is most of what makes a frame look
// shot rather than rendered.
//
// THE SHAPE OF THIS IS DECIDED BY THE TOGGLE, not by the effect. The pass has to go off at the
// reduced quality tier and come back when the controller restores, live, and the obvious structure --
// composer when it is on, `renderer.render` when it is off -- cannot do that cheaply. Three chooses a
// material's tone-mapping function by whether the render target is the canvas
// (`currentRenderTarget === null ? toneMapping : NoToneMapping`), so switching between the two paths
// changes the program every material compiles with, and the toggle costs a full recompile of the
// scene at the moment the device is already behind. That is the stall #193 refused for shadows.
//
// So the composer is ALWAYS the path when there is one, and the toggle is `grade.enabled`. The
// program set never changes. Safe mode gets no composer at all, which is a decision taken once at
// load and never switched.
//
// TONE MAPPING HAPPENS EXACTLY ONCE, in `OutputPass`. The scene renders into a target, so three
// gives every material `NoToneMapping` by itself; the grade therefore runs on LINEAR light, which is
// where a grade belongs, and `OutputPass` reads `renderer.toneMapping` and `outputColorSpace` at the
// end. The per-frame `toneMappingExposure` the day cycle animates keeps working untouched, because
// it is still read from the renderer. The check for this is in `post-once`: with the grade disabled,
// the composer path has to produce the SAME PIXELS as a direct render.
//
// MSAA IS KEPT. An EffectComposer renders to a target and the canvas's own multisampling goes with
// it, so the target asks for `samples` -- the same 4 the canvas would have had, and 0 wherever the
// canvas had none (a phone, safe mode). A jaggy world is a regression a vignette does not pay for.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CFG } from './config.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uVignette: { value: CFG.post.vignette },
    uGrade: { value: CFG.post.grade },
    uTemp: { value: CFG.post.temp },
    uBand: { value: new THREE.Vector2(CFG.post.from, CFG.post.to) },
    uNear: { value: new THREE.Color(CFG.post.near) },
    uFar: { value: new THREE.Color(CFG.post.far) },
    uCam: { value: new THREE.Vector2(0.5, 200) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uVignette;
    uniform float uGrade;
    uniform float uTemp;
    uniform vec2 uBand;
    uniform vec3 uNear;
    uniform vec3 uFar;
    uniform vec2 uCam;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      // #196: WARM NEAR, COOL FAR. Depth comes out of the buffer non-linear, so it is turned back
      // into a view-space distance before anything is done with it -- a tint keyed to raw depth
      // would put the whole change in the first few units in front of the camera. The packing chunk
      // is three's own and ShaderPass resolves includes like any other material. (No backticks in
      // here: this is a template literal, and one closes it.)
      float dz = texture2D( tDepth, vUv ).x;
      float dist = -perspectiveDepthToViewZ( dz, uCam.x, uCam.y );
      float far = smoothstep( uBand.x, uBand.y, dist );
      c.rgb = mix( c.rgb, c.rgb * mix( uNear, uFar, far ), uTemp );
      // Warm the highlights and cool the shadows, split by luminance. This runs BEFORE the tone map,
      // so the luminance is linear light, and 1.6 is what puts the crossover at the middle of the
      // picture rather than up in the sky. A backtick in a GLSL comment closes the template literal.
      float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      float k = clamp( l * 1.6, 0.0, 1.0 );
      vec3 tint = mix( vec3( 0.93, 0.97, 1.09 ), vec3( 1.07, 1.01, 0.92 ), k );
      c.rgb = mix( c.rgb, c.rgb * tint, uGrade );
      // In UV space rather than corrected for aspect, so it hugs the frame it is in: a round
      // vignette on a 390 x 844 phone would be a dark band across the middle of the picture.
      float r = length( vUv - 0.5 );
      c.rgb *= 1.0 - uVignette * smoothstep( 0.34, 0.95, r );
      gl_FragColor = c;
    }`,
};

export function makePost(renderer, scene, camera, { aa }) {
  // The game loop resets `info` once a frame from here on -- see the note at the render call. Left
  // on, three resets at the top of every pass and the frame reports one full-screen quad.
  renderer.info.autoReset = false;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // HalfFloat, because the grade runs on linear light before the tone map and an 8-bit target would
  // clip every highlight the tone map exists to roll off.
  const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
    type: THREE.HalfFloatType,
    samples: aa ? 4 : 0,
  });
  // #196: the depth of the scene, for the warm-near / cool-far tint. This is attached to the target
  // BEFORE the composer is built, and that is the only reason it is here: the composer's second
  // buffer is `target.clone()`, and a clone only gets a depth texture if the original had one.
  target.depthTexture = new THREE.DepthTexture(Math.max(1, size.x), Math.max(1, size.y));
  target.depthTexture.type = THREE.UnsignedIntType;
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uCam.value.set(camera.near, camera.far);
  // AND THIS IS WHY IT IS TAKEN FROM readBuffer EVERY FRAME rather than pinned to `target` once.
  // The composer names its buffers the other way round from the way they read: `writeBuffer` is
  // renderTarget1 -- the target passed in -- and `readBuffer` is renderTarget2, the clone. RenderPass
  // draws into readBuffer, so the scene's depth lands in the CLONE'S depth texture, which `copy()`
  // made as a separate object. Pinning the uniform to `target.depthTexture` samples a texture nothing
  // ever rendered into: it comes back 0, which `perspectiveDepthToViewZ` turns into the near plane,
  // so `far` is 0 over the whole screen and the frame gets the warm tint at every distance and no
  // gradient at all. That is exactly what it did -- ground at 17 units and ground at 39 both shifted
  // 14 toward warm, measured. Reading readBuffer follows the picture instead of guessing at it.
  const drawGrade = grade.render.bind(grade);
  grade.render = (r, writeBuffer, readBuffer, dt, mask) => {
    grade.uniforms.tDepth.value = readBuffer.depthTexture;
    drawGrade(r, writeBuffer, readBuffer, dt, mask);
  };
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer,
    grade,
    // The composer sizes its targets in DEVICE pixels, not CSS ones -- `getDrawingBufferSize` is what
    // has the pixel ratio in it, and the ratio moves with the quality tier (`q.dpr`).
    setSize() {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      composer.setSize(Math.max(1, s.x), Math.max(1, s.y));
      // The depth texture resizes itself -- `setupDepthTexture` corrects its image dimensions from
      // the render target's on the next bind -- and the uniform is re-pointed every frame anyway.
      // The camera's planes are re-read here in case a resize moved them.
      grade.uniforms.uCam.value.set(camera.near, camera.far);
    },
  };
}
