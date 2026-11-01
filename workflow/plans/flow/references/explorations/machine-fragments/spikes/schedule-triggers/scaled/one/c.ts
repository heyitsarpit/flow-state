import { definition, tokens } from "../../src/core.ts";
import { machine, timer } from "../../src/c.ts";
const D = definition({ id: "X", states: [{ G0: ["L0", "L1", "L2", "L3", "L4"] }, { G1: ["L0", "L1", "L2", "L3", "L4"] }, { G2: ["L0", "L1", "L2", "L3", "L4"] }, { G3: ["L0", "L1", "L2", "L3", "L4"] }, { G4: ["L0", "L1", "L2", "L3", "L4"] }, { G5: ["L0", "L1", "L2", "L3", "L4"] }], events: { Ev0: {}, Ev1: {}, Ev2: {}, Ev3: {}, Ev4: {}, Ev5: {}, Ev6: {}, Ev7: {}, Ev8: {}, Ev9: {}, Ev10: {}, Ev11: {}, Ev12: {}, Ev13: {}, Ev14: {}, Ev15: {}, Ev16: {}, Ev17: {}, Ev18: {}, Ev19: {} }, internalEvents: { T0Done: {}, T1Done: {}, T2Done: {}, T3Done: {}, T4Done: {}, T5Done: {}, T6Done: {}, T7Done: {}, T8Done: {}, T9Done: {}, T10Done: {}, T11Done: {}, T12Done: {}, T13Done: {}, T14Done: {}, T15Done: {}, T16Done: {}, T17Done: {}, T18Done: {}, T19Done: {}, T20Done: {}, T21Done: {}, T22Done: {}, T23Done: {}, T24Done: {}, T25Done: {}, T26Done: {}, T27Done: {}, T28Done: {}, T29Done: {}, T30Done: {}, T31Done: {}, T32Done: {}, T33Done: {}, T34Done: {}, T35Done: {}, T36Done: {}, T37Done: {}, T38Done: {}, T39Done: {} } });
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
const t20 = timer("21 seconds", E0.T20Done);
const t21 = timer("22 seconds", E0.T21Done);
const t22 = timer("23 seconds", E0.T22Done);
const t23 = timer("24 seconds", E0.T23Done);
const t24 = timer("25 seconds", E0.T24Done);
const t25 = timer("26 seconds", E0.T25Done);
const t26 = timer("27 seconds", E0.T26Done);
const t27 = timer("28 seconds", E0.T27Done);
const t28 = timer("29 seconds", E0.T28Done);
const t29 = timer("30 seconds", E0.T29Done);
const t30 = timer("31 seconds", E0.T30Done);
const t31 = timer("32 seconds", E0.T31Done);
const t32 = timer("33 seconds", E0.T32Done);
const t33 = timer("34 seconds", E0.T33Done);
const t34 = timer("35 seconds", E0.T34Done);
const t35 = timer("36 seconds", E0.T35Done);
const t36 = timer("37 seconds", E0.T36Done);
const t37 = timer("38 seconds", E0.T37Done);
const t38 = timer("39 seconds", E0.T38Done);
const t39 = timer("40 seconds", E0.T39Done);
export const m = machine(D, ({ S, E }) => ({
 default: S.G0,
 states: {
G0: { default: S.G0.L0, schedules: { t0, t6, t12, t18, t24, t30, t36 }, on: { Ev0: { target: "self", arm: [t0, t6], disarm: [t12, t18] }, Ev1: { target: "self", arm: [t6, t12], disarm: [t18, t24] }, Ev2: { target: "self", arm: [t12, t18], disarm: [t24, t30] }, Ev3: { target: "self", arm: [t18, t24], disarm: [t30, t36] } }, states: { L0: { on: { Ev4: { target: S.G0.L1, arm: [t0, t6] }, Ev5: { target: S.G0.L1, arm: [t6, t12] }, Ev6: { target: S.G0.L1, arm: [t12, t18] } } }, L1: { on: { Ev5: { target: S.G0.L2, arm: [t6, t12] }, Ev6: { target: S.G0.L2, arm: [t12, t18] }, Ev7: { target: S.G0.L2, arm: [t18, t24] } } }, L2: { on: { Ev6: { target: S.G0.L3, arm: [t12, t18] }, Ev7: { target: S.G0.L3, arm: [t18, t24] }, Ev8: { target: S.G0.L3, arm: [t24, t30] } } }, L3: { on: { Ev7: { target: S.G0.L4, arm: [t18, t24] }, Ev8: { target: S.G0.L4, arm: [t24, t30] }, Ev9: { target: S.G0.L4, arm: [t30, t36] } } }, L4: { on: { Ev8: { target: S.G0.L0, arm: [t24, t30] }, Ev9: { target: S.G0.L0, arm: [t30, t36] }, Ev10: { target: S.G0.L0, arm: [t36, t0] } } } } },
G1: { default: S.G1.L0, schedules: { t1, t7, t13, t19, t25, t31, t37 }, on: { Ev0: { target: "self", arm: [t1, t7], disarm: [t13, t19] }, Ev1: { target: "self", arm: [t7, t13], disarm: [t19, t25] }, Ev2: { target: "self", arm: [t13, t19], disarm: [t25, t31] }, Ev3: { target: "self", arm: [t19, t25], disarm: [t31, t37] } }, states: { L0: { on: { Ev4: { target: S.G1.L1, arm: [t1, t7] }, Ev5: { target: S.G1.L1, arm: [t7, t13] }, Ev6: { target: S.G1.L1, arm: [t13, t19] } } }, L1: { on: { Ev5: { target: S.G1.L2, arm: [t7, t13] }, Ev6: { target: S.G1.L2, arm: [t13, t19] }, Ev7: { target: S.G1.L2, arm: [t19, t25] } } }, L2: { on: { Ev6: { target: S.G1.L3, arm: [t13, t19] }, Ev7: { target: S.G1.L3, arm: [t19, t25] }, Ev8: { target: S.G1.L3, arm: [t25, t31] } } }, L3: { on: { Ev7: { target: S.G1.L4, arm: [t19, t25] }, Ev8: { target: S.G1.L4, arm: [t25, t31] }, Ev9: { target: S.G1.L4, arm: [t31, t37] } } }, L4: { on: { Ev8: { target: S.G1.L0, arm: [t25, t31] }, Ev9: { target: S.G1.L0, arm: [t31, t37] }, Ev10: { target: S.G1.L0, arm: [t37, t1] } } } } },
G2: { default: S.G2.L0, schedules: { t2, t8, t14, t20, t26, t32, t38 }, on: { Ev0: { target: "self", arm: [t2, t8], disarm: [t14, t20] }, Ev1: { target: "self", arm: [t8, t14], disarm: [t20, t26] }, Ev2: { target: "self", arm: [t14, t20], disarm: [t26, t32] }, Ev3: { target: "self", arm: [t20, t26], disarm: [t32, t38] } }, states: { L0: { on: { Ev4: { target: S.G2.L1, arm: [t2, t8] }, Ev5: { target: S.G2.L1, arm: [t8, t14] }, Ev6: { target: S.G2.L1, arm: [t14, t20] } } }, L1: { on: { Ev5: { target: S.G2.L2, arm: [t8, t14] }, Ev6: { target: S.G2.L2, arm: [t14, t20] }, Ev7: { target: S.G2.L2, arm: [t20, t26] } } }, L2: { on: { Ev6: { target: S.G2.L3, arm: [t14, t20] }, Ev7: { target: S.G2.L3, arm: [t20, t26] }, Ev8: { target: S.G2.L3, arm: [t26, t32] } } }, L3: { on: { Ev7: { target: S.G2.L4, arm: [t20, t26] }, Ev8: { target: S.G2.L4, arm: [t26, t32] }, Ev9: { target: S.G2.L4, arm: [t32, t38] } } }, L4: { on: { Ev8: { target: S.G2.L0, arm: [t26, t32] }, Ev9: { target: S.G2.L0, arm: [t32, t38] }, Ev10: { target: S.G2.L0, arm: [t38, t2] } } } } },
G3: { default: S.G3.L0, schedules: { t3, t9, t15, t21, t27, t33, t39 }, on: { Ev0: { target: "self", arm: [t3, t9], disarm: [t15, t21] }, Ev1: { target: "self", arm: [t9, t15], disarm: [t21, t27] }, Ev2: { target: "self", arm: [t15, t21], disarm: [t27, t33] }, Ev3: { target: "self", arm: [t21, t27], disarm: [t33, t39] } }, states: { L0: { on: { Ev4: { target: S.G3.L1, arm: [t3, t9] }, Ev5: { target: S.G3.L1, arm: [t9, t15] }, Ev6: { target: S.G3.L1, arm: [t15, t21] } } }, L1: { on: { Ev5: { target: S.G3.L2, arm: [t9, t15] }, Ev6: { target: S.G3.L2, arm: [t15, t21] }, Ev7: { target: S.G3.L2, arm: [t21, t27] } } }, L2: { on: { Ev6: { target: S.G3.L3, arm: [t15, t21] }, Ev7: { target: S.G3.L3, arm: [t21, t27] }, Ev8: { target: S.G3.L3, arm: [t27, t33] } } }, L3: { on: { Ev7: { target: S.G3.L4, arm: [t21, t27] }, Ev8: { target: S.G3.L4, arm: [t27, t33] }, Ev9: { target: S.G3.L4, arm: [t33, t39] } } }, L4: { on: { Ev8: { target: S.G3.L0, arm: [t27, t33] }, Ev9: { target: S.G3.L0, arm: [t33, t39] }, Ev10: { target: S.G3.L0, arm: [t39, t3] } } } } },
G4: { default: S.G4.L0, schedules: { t4, t10, t16, t22, t28, t34 }, on: { Ev0: { target: "self", arm: [t4, t10], disarm: [t16, t22] }, Ev1: { target: "self", arm: [t10, t16], disarm: [t22, t28] }, Ev2: { target: "self", arm: [t16, t22], disarm: [t28, t34] }, Ev3: { target: "self", arm: [t22, t28], disarm: [t34, t4] } }, states: { L0: { on: { Ev4: { target: S.G4.L1, arm: [t4, t10] }, Ev5: { target: S.G4.L1, arm: [t10, t16] }, Ev6: { target: S.G4.L1, arm: [t16, t22] } } }, L1: { on: { Ev5: { target: S.G4.L2, arm: [t10, t16] }, Ev6: { target: S.G4.L2, arm: [t16, t22] }, Ev7: { target: S.G4.L2, arm: [t22, t28] } } }, L2: { on: { Ev6: { target: S.G4.L3, arm: [t16, t22] }, Ev7: { target: S.G4.L3, arm: [t22, t28] }, Ev8: { target: S.G4.L3, arm: [t28, t34] } } }, L3: { on: { Ev7: { target: S.G4.L4, arm: [t22, t28] }, Ev8: { target: S.G4.L4, arm: [t28, t34] }, Ev9: { target: S.G4.L4, arm: [t34, t4] } } }, L4: { on: { Ev8: { target: S.G4.L0, arm: [t28, t34] }, Ev9: { target: S.G4.L0, arm: [t34, t4] }, Ev10: { target: S.G4.L0, arm: [t4, t10] } } } } },
G5: { default: S.G5.L0, schedules: { t5, t11, t17, t23, t29, t35 }, on: { Ev0: { target: "self", arm: [t5, t11], disarm: [t17, t23] }, Ev1: { target: "self", arm: [t11, t17], disarm: [t23, t29] }, Ev2: { target: "self", arm: [t17, t23], disarm: [t29, t35] }, Ev3: { target: "self", arm: [t23, t29], disarm: [t35, t5] } }, states: { L0: { on: { Ev4: { target: S.G5.L1, arm: [t5, t11] }, Ev5: { target: S.G5.L1, arm: [t11, t17] }, Ev6: { target: S.G5.L1, arm: [t17, t23] } } }, L1: { on: { Ev5: { target: S.G5.L2, arm: [t11, t17] }, Ev6: { target: S.G5.L2, arm: [t17, t23] }, Ev7: { target: S.G5.L2, arm: [t23, t29] } } }, L2: { on: { Ev6: { target: S.G5.L3, arm: [t17, t23] }, Ev7: { target: S.G5.L3, arm: [t23, t29] }, Ev8: { target: S.G5.L3, arm: [t29, t35] } } }, L3: { on: { Ev7: { target: S.G5.L4, arm: [t23, t29] }, Ev8: { target: S.G5.L4, arm: [t29, t35] }, Ev9: { target: S.G5.L4, arm: [t35, t5] } } }, L4: { on: { Ev8: { target: S.G5.L0, arm: [t29, t35] }, Ev9: { target: S.G5.L0, arm: [t35, t5] }, Ev10: { target: S.G5.L0, arm: [t5, t11] } } } } },
} }));
export const v = m.snapshot.schedules.t0;
