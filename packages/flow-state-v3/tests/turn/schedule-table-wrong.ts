/**
 * The rows of the schedule table the runtime gets wrong today, by kind, start and turn, each
 * inverted until one decision function decides a schedule's turn (Turn R14, R19, R25, R27).
 */
const WRONG = {
  "entry / idle / write":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x",
  "entry / idle / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "entry / idle / reenter":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / idle / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running / write":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "entry / running / reenter":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / held / write":
    "restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / held / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "entry / held / reenter":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / held / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running, A threw / write":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running, A threw / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "entry / running, A threw / reenter":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running, A threw / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running / firing due":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "entry / running, A threw / firing due":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "armOn / idle / write": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / idle / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / idle / reenter": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / idle / reenter, stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running / reenter": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running / reenter, stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / held / go": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / held / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / held / reenter": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / held / reenter, stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running, A threw / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running, A threw / reenter": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running, A threw / reenter, stop":
    "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running / firing due": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "armOn / running, A threw / firing due": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / idle / write": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / idle / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / idle / reenter, stop":
    "A t / B t; A t / B f; A t / B x; A f / B t; A f / B f; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / running / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / running / reenter, stop":
    "A t / B t; A t / B f; A t / B x; A f / B t; A f / B f; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / held / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / held / reenter": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / held / reenter, stop":
    "A t / B t; A t / B f; A t / B x; A f / B t; A f / B f; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / running, A threw / stop": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / running, A threw / reenter, stop":
    "A t / B t; A t / B f; A t / B x; A f / B t; A f / B f; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / running / firing due": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "plain / running, A threw / firing due": "A t / B x; A f / B x; A x / B t; A x / B f; A x / B x",
  "keyed / absent, key appears / write":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / absent, key appears / stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / absent, key appears / reenter":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / absent, key appears / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / idle, key stays / write":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x",
  "keyed / idle, key stays / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "keyed / idle, key stays / reenter":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / idle, key stays / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, key stays / write":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, key stays / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "keyed / running, key stays / reenter":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, key stays / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / held, key stays / write":
    "restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / held, key stays / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "keyed / held, key stays / reenter":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / held, key stays / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key stays / write":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key stays / stop":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B x; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x",
  "keyed / running, A threw, key stays / reenter":
    "restartOn throws / A t / B x; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key stays / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key leaves / write":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key leaves / stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key leaves / reenter":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key leaves / reenter, stop":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, key stays / firing due":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key stays / firing due":
    "restartOn same / A t / B x; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
  "keyed / running, A threw, key leaves / firing due":
    "restartOn same / A t / B t; restartOn same / A t / B f; restartOn same / A t / B x; restartOn same / A f / B t; restartOn same / A f / B f; restartOn same / A f / B x; restartOn same / A x / B t; restartOn same / A x / B f; restartOn same / A x / B x; restartOn changed / A t / B t; restartOn changed / A t / B f; restartOn changed / A t / B x; restartOn changed / A f / B t; restartOn changed / A f / B f; restartOn changed / A f / B x; restartOn changed / A x / B t; restartOn changed / A x / B f; restartOn changed / A x / B x; restartOn throws / A t / B t; restartOn throws / A t / B f; restartOn throws / A t / B x; restartOn throws / A f / B t; restartOn throws / A f / B f; restartOn throws / A f / B x; restartOn throws / A x / B t; restartOn throws / A x / B f; restartOn throws / A x / B x",
} satisfies Readonly<Record<string, string>>;

export const WRONG_TODAY: ReadonlySet<string> = new Set(
  Object.entries(WRONG).flatMap(([head, rows]) =>
    rows.split("; ").map((row) => `${head} / ${row}`),
  ),
);
