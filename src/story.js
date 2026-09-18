// #154: the beat table, keyed to the Keep level.
//
// The Keep level IS the story clock, because it is already the difficulty clock and already on the
// HUD as `Lv.` -- `docs/story.md` says so and this is that table in code. One entry per level, and
// the levels are the ones `CFG.base` already has (0..maxLevel), so nothing here invents a clock.
//
// WREN WRITES IT, and that is the whole trick rather than a flourish. The bible is explicit that she
// does not know what she is -- "She does not know this. Nobody has told her" -- so her entries can be
// vivid and specific and give NOTHING away, because she genuinely cannot explain what she is
// describing. A diary is also where a person puts the thing they will not say out loud, and the act
// table hands us exactly that: she starts dreaming at Lv. 7 and does not mention it, and says it out
// loud for the first time at Lv. 13. Between those two the player knows something Corvyn does not,
// which is dramatic irony rather than exposition -- and it makes the Lv. 13 beat land harder.
//
// LENGTH. Rule one of the bible is "never stop the game" and every spoken line is one or two
// sentences barked over play. That rule does not apply here and the exception is deliberate: this is
// opt-in, behind a pause the player asked for. So an entry is a short paragraph. Writing fifteen
// barks would waste the one surface in the game that can hold a thought.
//
// `beat` is the mechanical beat the level already is, kept beside the text so the two cannot drift --
// and so the `say()` bark system, when it exists, reads this table rather than a second one.
//
// DRAFT. These are a first pass against draft four of the bible and are meant to be rewritten by the
// person who owns the voice. The structure is the load-bearing part; the sentences are a starting
// point.
export const BEATS = [
  {
    lv: 1,
    beat: 'Keep raised · the first night',
    title: 'Home, or the shape of it',
    text: `They put me down at the picket like a sack of grain and Corvyn came through six men to get me, which I am told was reckless and which I will be dining out on for years. The hall is gone. The east wall is gone. He has built one room with a roof on it and called it the Keep, and he says it with a straight face. I have married a very stubborn man. Tonight he stood at the gap where the gate was and asked nobody in particular why they only come after dark.`,
  },
  {
    lv: 2,
    beat: 'Expansion · Ser Bracken arrives',
    title: 'The knight who was not sent for',
    text: `A knight rode in today, unasked, from somewhere south, and had a work party on the north wall before anyone thought to ask his name. Ser Bracken. He is useful in the way a good hammer is useful, and I have not decided whether that is a compliment. Corvyn likes him. Corvyn likes anyone who picks up a shovel without being told.`,
  },
  {
    lv: 3,
    beat: 'Barracks · sappers',
    title: 'One of them was not looking at us',
    text: `There was one last night that did not come at the men at all. It walked past the line, past me, and put its shoulder to the wall like a man doing a job he had been given. Corvyn watched it the whole way in and said, quietly, *that one isn't coming for us, he's coming for the wall.* Then he went and got more stone.`,
  },
  {
    lv: 4,
    beat: 'Stone · Bramble names it',
    title: 'Look at their feet',
    text: `The hedge-witch from the fen came up to the wall this morning — Bramble, and she uses the word witch like a trade, the way I would say smith. She would not look at the bodies. She looked at the ground in front of them and said, *look at their feet.* There had been rain all night. There were no prints. I have written that down because saying it did not make it any smaller.`,
  },
  {
    lv: 5,
    beat: 'Enemy archers',
    title: 'Our colours, under the rust',
    text: `They have bowmen now, and they stand off and shoot the wall crews, which is a thing that requires being taught. One came down close enough to see properly. Under all that rust the surcoat is ours. Not a copy of ours. Ours. Corvyn has not said anything about it and I am not going to be the one who does.`,
  },
  {
    lv: 6,
    beat: 'Second expansion · TWIST 1',
    title: 'Hal knew the face',
    text: `Hal went very quiet on the east wall and then sat down in the mud with his sword still in his hand. He had recognised one. He said it was his father, and his father has been in the ground by the chapel for eleven years, and Hal is not a man who says things for effect. Nobody argued with him. That is the part I keep turning over — nobody argued.`,
  },
  {
    lv: 7,
    beat: 'Marauders · shieldbearers · the dream begins',
    title: 'A hill with a door in it',
    text: `I am putting this here and nowhere else. Three nights running now: a hill with a door in it, and someone inside who knows my name. She is very polite about it. She asks whether I have come yet, as though I am late for something that was arranged a long time ago and nobody thought to tell me. I wake up with my hands aching. Saying it out loud would make it a thing, so I am not saying it out loud.`,
  },
  {
    lv: 8,
    beat: 'Iron · Ilka surrenders',
    title: 'She would not say until morning',
    text: `Ilka put her weapon down in the middle of it and would not pick it back up. Not fear — I know what that looks like on her. She stood there until dawn and only then would she say what she had seen, and she said it to Bramble and not to us. Bramble has not repeated it. I have stopped asking people to repeat things.`,
  },
  {
    lv: 9,
    beat: 'TWIST 2 · the Rook',
    title: 'It was not carrying gold',
    text: `We cut down one of the tall thin ones that takes things away, and what it had on its back was Dain. Not Dain's purse. Dain. He went over the wall on night six and we have been telling his sister he was carried off for ransom, which I now understand was a kindness we invented for ourselves. They are not stealing from us. They are collecting.`,
  },
  {
    lv: 10,
    beat: 'Bramble admits it',
    title: 'Forty years of not saying',
    text: `Bramble sat down opposite me today, which she has never once done, and told me she has known for forty years. Not all of it. Enough of it. She said there is something in the north that ought to stay shut and somebody has always been the one holding it, and that whoever has the job now is not managing any more. Then she looked at me for a good deal longer than was comfortable and asked how I was sleeping.`,
  },
  {
    lv: 11,
    beat: 'Warlords',
    title: 'Four hundred years out of fashion',
    text: `The big ones came tonight. Corvyn went through the armoury afterwards with a lamp, comparing, and came back looking like a man who has done his sums twice and got the same wrong answer. The oldest of them is wearing a pattern nobody has forged since his great-grandfather's great-grandfather. It has been kept oiled. That is the detail I cannot put down.`,
  },
  {
    lv: 12,
    beat: 'Diamond · THE BETRAYAL',
    title: 'The east gate was not forced',
    text: `The east gate was open and it was not forced. Bracken opened it, and he did not run afterwards, which is somehow worse. He stood there and waited for us to come and find him standing there. He says he was promised something. He will not say what, or by whom, and he keeps looking north while he refuses. Corvyn has not decided what to do with him. I am glad it is not my decision and I am ashamed of being glad.`,
  },
  {
    lv: 13,
    beat: 'The march opens',
    title: 'I said it out loud',
    text: `I told him. About the hill, and the door, and the woman inside who is so polite about it. He did not laugh and he did not tell me it was nothing, which are the two things I had braced for. He sat with it. Then he said *right* — that is all, *right* — and went out to tell the men we are marching north. I have been carrying that dream for six weeks. He carried it for about four seconds and then went and did something about it. I do not know yet whether that is the best or the worst thing about him.`,
  },
  {
    lv: 14,
    beat: 'Max Keep · the scouts stop',
    title: 'Nothing came last night',
    text: `Nothing came last night. Not a thing. After all this, an empty field is the most frightening thing I have seen since they carried me out of my own hall. He has stopped sending them. You only stop looking at a road when you already know who is coming up it.`,
  },
  {
    lv: 15,
    beat: 'Max Keep · before the march',
    title: 'What I have not written down',
    text: `The walls are higher than they ever were. There are more of us than there were before, which I did not think I would ever be able to write. Tomorrow we go north, and everyone is being very brisk about it. There is one thing I have not put in here anywhere and I am not going to now, except to say that I have stopped being afraid of the door and started being afraid of what I will do when it opens.`,
  },
];

// The entry for a Keep level, or null. Levels above the table's end simply have none.
export function beatFor(level) {
  return BEATS.find((b) => b.lv === level) || null;
}

// #159: the cast, keyed to the same clock as the diary and unlocked BY it. A cast list is the one
// surface in the game that could hand the player the twist for free -- the Rust has a name and there
// is a statue of him in the square -- so an entry may say only what the player already knows at the
// point they could first read it. Each stage is keyed to a Keep level and shows once Wren's page for
// that level is unlocked (`readDiary`), so the cast never says a word the diary has not: no second
// store, no second trigger, nothing to drift. A character with no stage yet is a locked slot with the
// level it wants and nothing else, the way a locked diary page is.
//
// `face` names a speaker whose portrait was rendered at load (#100); the rest get a medallion in
// their colour, because Bramble, Bracken and Ilka have no model yet and a missing image is not a
// portrait. They are here even so: Wren has already written about each of them by the level their
// slot opens, so the list promises nothing the diary has not already delivered.
//
// DRAFT, in the same sense the beats above are: written against draft four of the bible, structure
// load-bearing, sentences a starting point for whoever owns the voice.
export const CAST = [
  {
    id: 'corvyn', name: 'King Corvyn', role: 'the King', face: 'The King', colour: '#ffd27a',
    stages: [
      { lv: 0, text: `Young, stubborn, and the first king in four generations to do any of the work himself — the one with the pick in his hand when the quarry wants working. Married a blacksmith's daughter and never explained himself about it. His answer to anything he does not understand is to fetch a hammer and ask what it is made of.` },
      { lv: 6, text: `He watched one of his own soldiers know a face among the dead and said nothing that night. He is not a man who says nothing. Whatever is coming over the wall was once from here, and he has started to look at it the way he looks at a bad join in the stonework.` },
    ],
  },
  {
    id: 'wren', name: 'Wren', role: 'the Queen', face: 'Wren', colour: '#ffb0cd',
    stages: [
      { lv: 0, text: `Not highborn. Broad hands, no patience for court, funny in a way that alarms people. She walks a step behind the King, and it is her the raiders come for — which nobody has explained to her either. She keeps a diary. It is in this menu.` },
      { lv: 7, text: `She has started dreaming. She has not mentioned it to anyone, and she has not written it down — read the last few entries again and notice what is not in them.` },
      { lv: 13, text: `She has said it out loud: *a hill with a door in it, and someone inside who knows my name. She's very polite about it.* She is the last of a line she had never heard of, and what that costs is her decision, not the King's.` },
    ],
  },
  {
    id: 'rust', name: 'The Rust', role: 'the enemy', colour: '#c9744a',
    stages: [
      { lv: 1, text: `A man in rusted armour who leads the raids and has not taken his helm off in anyone's memory. That is the whole of what is known, and it has been enough for twenty years.` },
      { lv: 5, text: `The men under him wear the kingdom's own colours under the rust. Somebody taught them to stand off and shoot the wall crews. Somebody is giving orders.` },
      { lv: 6, text: `One of your own soldiers knew a face among the dead. It was his father's. Whoever the Rust is, what he sends against the wall was once from here — and he has kept sending it.` },
      { lv: 14, text: `He has stopped sending scouts. He knows you are coming, and he has been waiting a long time. There are people alive who would know the face under that helm. Bramble is one of them.` },
    ],
  },
  {
    id: 'bracken', name: 'Ser Bracken', role: 'the knight nobody sent for', colour: '#9fb4d8',
    stages: [
      { lv: 2, text: `Rode in unasked, from somewhere south, and had a work party on the north wall before anyone thought to ask his name. Useful the way a good hammer is useful. Nobody sent for him, and nobody has asked him why he came.` },
      { lv: 12, text: `He opened the east gate. He is not on this list any more; he is in the raid.` },
    ],
  },
  {
    id: 'bramble', name: 'Bramble', role: 'the hedge-witch', colour: '#a9d17a',
    stages: [
      { lv: 4, text: `The wise woman from the fen. Chickens, poultices, seventy-odd, a filthy sense of humour, and the first person in the game to say *witch* and mean it as a trade. She would not look at the bodies. She looked at their feet.` },
      { lv: 10, text: `She has known what they are for forty years and has finally said so. She has not said how she knows, and she does not intend to.` },
    ],
  },
  {
    id: 'ilka', name: 'Ilka', role: 'one of theirs', colour: '#d8c59a',
    stages: [
      { lv: 8, text: `One of theirs, who put her sword down in the iron field instead of using it, and would not say a word until dawn. What she said then is in Wren's hand, in the diary.` },
    ],
  },
];
