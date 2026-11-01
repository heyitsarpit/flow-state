import { definition, tokens } from "../../src/core.ts";
import { machine, timer } from "../../src/c.ts";
const D = definition({ id: "X", states: [{ G0: ["L0", "L1", "L2", "L3", "L4"] }, { G1: ["L0", "L1", "L2", "L3", "L4"] }, { G2: ["L0", "L1", "L2", "L3", "L4"] }], events: { Ev0: {}, Ev1: {}, Ev2: {}, Ev3: {}, Ev4: {}, Ev5: {}, Ev6: {}, Ev7: {}, Ev8: {}, Ev9: {}, Ev10: {}, Ev11: {}, Ev12: {}, Ev13: {}, Ev14: {}, Ev15: {}, Ev16: {}, Ev17: {}, Ev18: {}, Ev19: {} }, internalEvents: { T0Done: {}, T1Done: {}, T2Done: {}, T3Done: {}, T4Done: {}, T5Done: {}, T6Done: {}, T7Done: {}, T8Done: {}, T9Done: {}, T10Done: {}, T11Done: {}, T12Done: {}, T13Done: {}, T14Done: {}, T15Done: {}, T16Done: {}, T17Done: {}, T18Done: {}, T19Done: {} } });
const E0 = tokens(D).E;
const t0 = timer("1 seconds", E0.T0Done);
const t1 = timer("2 seconds", E0.T1Done);
const t2 = timer("3 seconds", E0.T2Done);
const t3 = timer("4 seconds", E0.T3Done);
const t4 = timer("5 seconds", E0.T4Done);
const t5 = timer("6 seconds", E0.T5Done);
const t6 = timer("7 seconds", E0.T6Done);
const t7 = timer("8 seconds", E0.T7Done);
const t8 = timer("9 seconds", E0.T8Done);
const t9 = timer("10 seconds", E0.T9Done);
const t10 = timer("11 seconds", E0.T10Done);
const t11 = timer("12 seconds", E0.T11Done);
const t12 = timer("13 seconds", E0.T12Done);
const t13 = timer("14 seconds", E0.T13Done);
const t14 = timer("15 seconds", E0.T14Done);
const t15 = timer("16 seconds", E0.T15Done);
const t16 = timer("17 seconds", E0.T16Done);
const t17 = timer("18 seconds", E0.T17Done);
const t18 = timer("19 seconds", E0.T18Done);
const t19 = timer("20 seconds", E0.T19Done);
export const m = machine(D, ({ S, E }) => ({
 default: S.G0,
 states: {
G0: { default: S.G0.L0, schedules: { t0, t3, t6, t9, t12, t15, t18 }, on: { Ev0: { target: "self", arm: [t0, t3], disarm: [t6, t9] }, Ev1: { target: "self", arm: [t3, t6], disarm: [t9, t12] }, Ev2: { target: "self", arm: [t6, t9], disarm: [t12, t15] }, Ev3: { target: "self", arm: [t9, t12], disarm: [t15, t18] } }, states: { L0: { on: { Ev4: { target: S.G0.L1, arm: [t0, t3] }, Ev5: { target: S.G0.L1, arm: [t3, t6] }, Ev6: { target: S.G0.L1, arm: [t6, t9] } } }, L1: { on: { Ev5: { target: S.G0.L2, arm: [t3, t6] }, Ev6: { target: S.G0.L2, arm: [t6, t9] }, Ev7: { target: S.G0.L2, arm: [t9, t12] } } }, L2: { on: { Ev6: { target: S.G0.L3, arm: [t6, t9] }, Ev7: { target: S.G0.L3, arm: [t9, t12] }, Ev8: { target: S.G0.L3, arm: [t12, t15] } } }, L3: { on: { Ev7: { target: S.G0.L4, arm: [t9, t12] }, Ev8: { target: S.G0.L4, arm: [t12, t15] }, Ev9: { target: S.G0.L4, arm: [t15, t18] } } }, L4: { on: { Ev8: { target: S.G0.L0, arm: [t12, t15] }, Ev9: { target: S.G0.L0, arm: [t15, t18] }, Ev10: { target: S.G0.L0, arm: [t18, t0] } } } } },
G1: { default: S.G1.L0, schedules: { t1, t4, t7, t10, t13, t16, t19 }, on: { Ev0: { target: "self", arm: [t1, t4], disarm: [t7, t10] }, Ev1: { target: "self", arm: [t4, t7], disarm: [t10, t13] }, Ev2: { target: "self", arm: [t7, t10], disarm: [t13, t16] }, Ev3: { target: "self", arm: [t10, t13], disarm: [t16, t19] } }, states: { L0: { on: { Ev4: { target: S.G1.L1, arm: [t1, t4] }, Ev5: { target: S.G1.L1, arm: [t4, t7] }, Ev6: { target: S.G1.L1, arm: [t7, t10] } } }, L1: { on: { Ev5: { target: S.G1.L2, arm: [t4, t7] }, Ev6: { target: S.G1.L2, arm: [t7, t10] }, Ev7: { target: S.G1.L2, arm: [t10, t13] } } }, L2: { on: { Ev6: { target: S.G1.L3, arm: [t7, t10] }, Ev7: { target: S.G1.L3, arm: [t10, t13] }, Ev8: { target: S.G1.L3, arm: [t13, t16] } } }, L3: { on: { Ev7: { target: S.G1.L4, arm: [t10, t13] }, Ev8: { target: S.G1.L4, arm: [t13, t16] }, Ev9: { target: S.G1.L4, arm: [t16, t19] } } }, L4: { on: { Ev8: { target: S.G1.L0, arm: [t13, t16] }, Ev9: { target: S.G1.L0, arm: [t16, t19] }, Ev10: { target: S.G1.L0, arm: [t19, t1] } } } } },
G2: { default: S.G2.L0, schedules: { t2, t5, t8, t11, t14, t17 }, on: { Ev0: { target: "self", arm: [t2, t5], disarm: [t8, t11] }, Ev1: { target: "self", arm: [t5, t8], disarm: [t11, t14] }, Ev2: { target: "self", arm: [t8, t11], disarm: [t14, t17] }, Ev3: { target: "self", arm: [t11, t14], disarm: [t17, t2] } }, states: { L0: { on: { Ev4: { target: S.G2.L1, arm: [t2, t5] }, Ev5: { target: S.G2.L1, arm: [t5, t8] }, Ev6: { target: S.G2.L1, arm: [t8, t11] } } }, L1: { on: { Ev5: { target: S.G2.L2, arm: [t5, t8] }, Ev6: { target: S.G2.L2, arm: [t8, t11] }, Ev7: { target: S.G2.L2, arm: [t11, t14] } } }, L2: { on: { Ev6: { target: S.G2.L3, arm: [t8, t11] }, Ev7: { target: S.G2.L3, arm: [t11, t14] }, Ev8: { target: S.G2.L3, arm: [t14, t17] } } }, L3: { on: { Ev7: { target: S.G2.L4, arm: [t11, t14] }, Ev8: { target: S.G2.L4, arm: [t14, t17] }, Ev9: { target: S.G2.L4, arm: [t17, t2] } } }, L4: { on: { Ev8: { target: S.G2.L0, arm: [t14, t17] }, Ev9: { target: S.G2.L0, arm: [t17, t2] }, Ev10: { target: S.G2.L0, arm: [t2, t5] } } } } },
} }));
export const v = m.snapshot.schedules.t0;
