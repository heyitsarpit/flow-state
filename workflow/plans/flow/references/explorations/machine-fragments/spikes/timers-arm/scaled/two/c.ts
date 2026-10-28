import { definition, tokens } from "../../src/core.ts";
import { machine, timer } from "../../src/c.ts";
const D = definition({ id: "X", states: [{ G0: ["L0", "L1", "L2", "L3", "L4"] }, { G1: ["L0", "L1", "L2", "L3", "L4"] }, { G2: ["L0", "L1", "L2", "L3", "L4"] }, { G3: ["L0", "L1", "L2", "L3", "L4"] }, { G4: ["L0", "L1", "L2", "L3", "L4"] }, { G5: ["L0", "L1", "L2", "L3", "L4"] }, { G6: ["L0", "L1", "L2", "L3", "L4"] }, { G7: ["L0", "L1", "L2", "L3", "L4"] }, { G8: ["L0", "L1", "L2", "L3", "L4"] }, { G9: ["L0", "L1", "L2", "L3", "L4"] }, { G10: ["L0", "L1", "L2", "L3", "L4"] }, { G11: ["L0", "L1", "L2", "L3", "L4"] }], events: { Ev0: {}, Ev1: {}, Ev2: {}, Ev3: {}, Ev4: {}, Ev5: {}, Ev6: {}, Ev7: {}, Ev8: {}, Ev9: {}, Ev10: {}, Ev11: {}, Ev12: {}, Ev13: {}, Ev14: {}, Ev15: {}, Ev16: {}, Ev17: {}, Ev18: {}, Ev19: {} }, internalEvents: { T0Done: {}, T1Done: {}, T2Done: {}, T3Done: {}, T4Done: {}, T5Done: {}, T6Done: {}, T7Done: {}, T8Done: {}, T9Done: {}, T10Done: {}, T11Done: {}, T12Done: {}, T13Done: {}, T14Done: {}, T15Done: {}, T16Done: {}, T17Done: {}, T18Done: {}, T19Done: {}, T20Done: {}, T21Done: {}, T22Done: {}, T23Done: {}, T24Done: {}, T25Done: {}, T26Done: {}, T27Done: {}, T28Done: {}, T29Done: {}, T30Done: {}, T31Done: {}, T32Done: {}, T33Done: {}, T34Done: {}, T35Done: {}, T36Done: {}, T37Done: {}, T38Done: {}, T39Done: {}, T40Done: {}, T41Done: {}, T42Done: {}, T43Done: {}, T44Done: {}, T45Done: {}, T46Done: {}, T47Done: {}, T48Done: {}, T49Done: {}, T50Done: {}, T51Done: {}, T52Done: {}, T53Done: {}, T54Done: {}, T55Done: {}, T56Done: {}, T57Done: {}, T58Done: {}, T59Done: {}, T60Done: {}, T61Done: {}, T62Done: {}, T63Done: {}, T64Done: {}, T65Done: {}, T66Done: {}, T67Done: {}, T68Done: {}, T69Done: {}, T70Done: {}, T71Done: {}, T72Done: {}, T73Done: {}, T74Done: {}, T75Done: {}, T76Done: {}, T77Done: {}, T78Done: {}, T79Done: {} } });
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
const t40 = timer("41 seconds", E0.T40Done);
const t41 = timer("42 seconds", E0.T41Done);
const t42 = timer("43 seconds", E0.T42Done);
const t43 = timer("44 seconds", E0.T43Done);
const t44 = timer("45 seconds", E0.T44Done);
const t45 = timer("46 seconds", E0.T45Done);
const t46 = timer("47 seconds", E0.T46Done);
const t47 = timer("48 seconds", E0.T47Done);
const t48 = timer("49 seconds", E0.T48Done);
const t49 = timer("50 seconds", E0.T49Done);
const t50 = timer("51 seconds", E0.T50Done);
const t51 = timer("52 seconds", E0.T51Done);
const t52 = timer("53 seconds", E0.T52Done);
const t53 = timer("54 seconds", E0.T53Done);
const t54 = timer("55 seconds", E0.T54Done);
const t55 = timer("56 seconds", E0.T55Done);
const t56 = timer("57 seconds", E0.T56Done);
const t57 = timer("58 seconds", E0.T57Done);
const t58 = timer("59 seconds", E0.T58Done);
const t59 = timer("60 seconds", E0.T59Done);
const t60 = timer("61 seconds", E0.T60Done);
const t61 = timer("62 seconds", E0.T61Done);
const t62 = timer("63 seconds", E0.T62Done);
const t63 = timer("64 seconds", E0.T63Done);
const t64 = timer("65 seconds", E0.T64Done);
const t65 = timer("66 seconds", E0.T65Done);
const t66 = timer("67 seconds", E0.T66Done);
const t67 = timer("68 seconds", E0.T67Done);
const t68 = timer("69 seconds", E0.T68Done);
const t69 = timer("70 seconds", E0.T69Done);
const t70 = timer("71 seconds", E0.T70Done);
const t71 = timer("72 seconds", E0.T71Done);
const t72 = timer("73 seconds", E0.T72Done);
const t73 = timer("74 seconds", E0.T73Done);
const t74 = timer("75 seconds", E0.T74Done);
const t75 = timer("76 seconds", E0.T75Done);
const t76 = timer("77 seconds", E0.T76Done);
const t77 = timer("78 seconds", E0.T77Done);
const t78 = timer("79 seconds", E0.T78Done);
const t79 = timer("80 seconds", E0.T79Done);
export const m = machine(D, ({ S, E }) => ({
 default: S.G0,
 states: {
G0: { default: S.G0.L0, schedules: { t0, t12, t24, t36, t48, t60, t72 }, on: { Ev0: { target: "self", arm: [t0, t12], disarm: [t24, t36] }, Ev1: { target: "self", arm: [t12, t24], disarm: [t36, t48] }, Ev2: { target: "self", arm: [t24, t36], disarm: [t48, t60] }, Ev3: { target: "self", arm: [t36, t48], disarm: [t60, t72] } }, states: { L0: { on: { Ev4: { target: S.G0.L1, arm: [t0, t12] }, Ev5: { target: S.G0.L1, arm: [t12, t24] }, Ev6: { target: S.G0.L1, arm: [t24, t36] } } }, L1: { on: { Ev5: { target: S.G0.L2, arm: [t12, t24] }, Ev6: { target: S.G0.L2, arm: [t24, t36] }, Ev7: { target: S.G0.L2, arm: [t36, t48] } } }, L2: { on: { Ev6: { target: S.G0.L3, arm: [t24, t36] }, Ev7: { target: S.G0.L3, arm: [t36, t48] }, Ev8: { target: S.G0.L3, arm: [t48, t60] } } }, L3: { on: { Ev7: { target: S.G0.L4, arm: [t36, t48] }, Ev8: { target: S.G0.L4, arm: [t48, t60] }, Ev9: { target: S.G0.L4, arm: [t60, t72] } } }, L4: { on: { Ev8: { target: S.G0.L0, arm: [t48, t60] }, Ev9: { target: S.G0.L0, arm: [t60, t72] }, Ev10: { target: S.G0.L0, arm: [t72, t0] } } } } },
G1: { default: S.G1.L0, schedules: { t1, t13, t25, t37, t49, t61, t73 }, on: { Ev0: { target: "self", arm: [t1, t13], disarm: [t25, t37] }, Ev1: { target: "self", arm: [t13, t25], disarm: [t37, t49] }, Ev2: { target: "self", arm: [t25, t37], disarm: [t49, t61] }, Ev3: { target: "self", arm: [t37, t49], disarm: [t61, t73] } }, states: { L0: { on: { Ev4: { target: S.G1.L1, arm: [t1, t13] }, Ev5: { target: S.G1.L1, arm: [t13, t25] }, Ev6: { target: S.G1.L1, arm: [t25, t37] } } }, L1: { on: { Ev5: { target: S.G1.L2, arm: [t13, t25] }, Ev6: { target: S.G1.L2, arm: [t25, t37] }, Ev7: { target: S.G1.L2, arm: [t37, t49] } } }, L2: { on: { Ev6: { target: S.G1.L3, arm: [t25, t37] }, Ev7: { target: S.G1.L3, arm: [t37, t49] }, Ev8: { target: S.G1.L3, arm: [t49, t61] } } }, L3: { on: { Ev7: { target: S.G1.L4, arm: [t37, t49] }, Ev8: { target: S.G1.L4, arm: [t49, t61] }, Ev9: { target: S.G1.L4, arm: [t61, t73] } } }, L4: { on: { Ev8: { target: S.G1.L0, arm: [t49, t61] }, Ev9: { target: S.G1.L0, arm: [t61, t73] }, Ev10: { target: S.G1.L0, arm: [t73, t1] } } } } },
G2: { default: S.G2.L0, schedules: { t2, t14, t26, t38, t50, t62, t74 }, on: { Ev0: { target: "self", arm: [t2, t14], disarm: [t26, t38] }, Ev1: { target: "self", arm: [t14, t26], disarm: [t38, t50] }, Ev2: { target: "self", arm: [t26, t38], disarm: [t50, t62] }, Ev3: { target: "self", arm: [t38, t50], disarm: [t62, t74] } }, states: { L0: { on: { Ev4: { target: S.G2.L1, arm: [t2, t14] }, Ev5: { target: S.G2.L1, arm: [t14, t26] }, Ev6: { target: S.G2.L1, arm: [t26, t38] } } }, L1: { on: { Ev5: { target: S.G2.L2, arm: [t14, t26] }, Ev6: { target: S.G2.L2, arm: [t26, t38] }, Ev7: { target: S.G2.L2, arm: [t38, t50] } } }, L2: { on: { Ev6: { target: S.G2.L3, arm: [t26, t38] }, Ev7: { target: S.G2.L3, arm: [t38, t50] }, Ev8: { target: S.G2.L3, arm: [t50, t62] } } }, L3: { on: { Ev7: { target: S.G2.L4, arm: [t38, t50] }, Ev8: { target: S.G2.L4, arm: [t50, t62] }, Ev9: { target: S.G2.L4, arm: [t62, t74] } } }, L4: { on: { Ev8: { target: S.G2.L0, arm: [t50, t62] }, Ev9: { target: S.G2.L0, arm: [t62, t74] }, Ev10: { target: S.G2.L0, arm: [t74, t2] } } } } },
G3: { default: S.G3.L0, schedules: { t3, t15, t27, t39, t51, t63, t75 }, on: { Ev0: { target: "self", arm: [t3, t15], disarm: [t27, t39] }, Ev1: { target: "self", arm: [t15, t27], disarm: [t39, t51] }, Ev2: { target: "self", arm: [t27, t39], disarm: [t51, t63] }, Ev3: { target: "self", arm: [t39, t51], disarm: [t63, t75] } }, states: { L0: { on: { Ev4: { target: S.G3.L1, arm: [t3, t15] }, Ev5: { target: S.G3.L1, arm: [t15, t27] }, Ev6: { target: S.G3.L1, arm: [t27, t39] } } }, L1: { on: { Ev5: { target: S.G3.L2, arm: [t15, t27] }, Ev6: { target: S.G3.L2, arm: [t27, t39] }, Ev7: { target: S.G3.L2, arm: [t39, t51] } } }, L2: { on: { Ev6: { target: S.G3.L3, arm: [t27, t39] }, Ev7: { target: S.G3.L3, arm: [t39, t51] }, Ev8: { target: S.G3.L3, arm: [t51, t63] } } }, L3: { on: { Ev7: { target: S.G3.L4, arm: [t39, t51] }, Ev8: { target: S.G3.L4, arm: [t51, t63] }, Ev9: { target: S.G3.L4, arm: [t63, t75] } } }, L4: { on: { Ev8: { target: S.G3.L0, arm: [t51, t63] }, Ev9: { target: S.G3.L0, arm: [t63, t75] }, Ev10: { target: S.G3.L0, arm: [t75, t3] } } } } },
G4: { default: S.G4.L0, schedules: { t4, t16, t28, t40, t52, t64, t76 }, on: { Ev0: { target: "self", arm: [t4, t16], disarm: [t28, t40] }, Ev1: { target: "self", arm: [t16, t28], disarm: [t40, t52] }, Ev2: { target: "self", arm: [t28, t40], disarm: [t52, t64] }, Ev3: { target: "self", arm: [t40, t52], disarm: [t64, t76] } }, states: { L0: { on: { Ev4: { target: S.G4.L1, arm: [t4, t16] }, Ev5: { target: S.G4.L1, arm: [t16, t28] }, Ev6: { target: S.G4.L1, arm: [t28, t40] } } }, L1: { on: { Ev5: { target: S.G4.L2, arm: [t16, t28] }, Ev6: { target: S.G4.L2, arm: [t28, t40] }, Ev7: { target: S.G4.L2, arm: [t40, t52] } } }, L2: { on: { Ev6: { target: S.G4.L3, arm: [t28, t40] }, Ev7: { target: S.G4.L3, arm: [t40, t52] }, Ev8: { target: S.G4.L3, arm: [t52, t64] } } }, L3: { on: { Ev7: { target: S.G4.L4, arm: [t40, t52] }, Ev8: { target: S.G4.L4, arm: [t52, t64] }, Ev9: { target: S.G4.L4, arm: [t64, t76] } } }, L4: { on: { Ev8: { target: S.G4.L0, arm: [t52, t64] }, Ev9: { target: S.G4.L0, arm: [t64, t76] }, Ev10: { target: S.G4.L0, arm: [t76, t4] } } } } },
G5: { default: S.G5.L0, schedules: { t5, t17, t29, t41, t53, t65, t77 }, on: { Ev0: { target: "self", arm: [t5, t17], disarm: [t29, t41] }, Ev1: { target: "self", arm: [t17, t29], disarm: [t41, t53] }, Ev2: { target: "self", arm: [t29, t41], disarm: [t53, t65] }, Ev3: { target: "self", arm: [t41, t53], disarm: [t65, t77] } }, states: { L0: { on: { Ev4: { target: S.G5.L1, arm: [t5, t17] }, Ev5: { target: S.G5.L1, arm: [t17, t29] }, Ev6: { target: S.G5.L1, arm: [t29, t41] } } }, L1: { on: { Ev5: { target: S.G5.L2, arm: [t17, t29] }, Ev6: { target: S.G5.L2, arm: [t29, t41] }, Ev7: { target: S.G5.L2, arm: [t41, t53] } } }, L2: { on: { Ev6: { target: S.G5.L3, arm: [t29, t41] }, Ev7: { target: S.G5.L3, arm: [t41, t53] }, Ev8: { target: S.G5.L3, arm: [t53, t65] } } }, L3: { on: { Ev7: { target: S.G5.L4, arm: [t41, t53] }, Ev8: { target: S.G5.L4, arm: [t53, t65] }, Ev9: { target: S.G5.L4, arm: [t65, t77] } } }, L4: { on: { Ev8: { target: S.G5.L0, arm: [t53, t65] }, Ev9: { target: S.G5.L0, arm: [t65, t77] }, Ev10: { target: S.G5.L0, arm: [t77, t5] } } } } },
G6: { default: S.G6.L0, schedules: { t6, t18, t30, t42, t54, t66, t78 }, on: { Ev0: { target: "self", arm: [t6, t18], disarm: [t30, t42] }, Ev1: { target: "self", arm: [t18, t30], disarm: [t42, t54] }, Ev2: { target: "self", arm: [t30, t42], disarm: [t54, t66] }, Ev3: { target: "self", arm: [t42, t54], disarm: [t66, t78] } }, states: { L0: { on: { Ev4: { target: S.G6.L1, arm: [t6, t18] }, Ev5: { target: S.G6.L1, arm: [t18, t30] }, Ev6: { target: S.G6.L1, arm: [t30, t42] } } }, L1: { on: { Ev5: { target: S.G6.L2, arm: [t18, t30] }, Ev6: { target: S.G6.L2, arm: [t30, t42] }, Ev7: { target: S.G6.L2, arm: [t42, t54] } } }, L2: { on: { Ev6: { target: S.G6.L3, arm: [t30, t42] }, Ev7: { target: S.G6.L3, arm: [t42, t54] }, Ev8: { target: S.G6.L3, arm: [t54, t66] } } }, L3: { on: { Ev7: { target: S.G6.L4, arm: [t42, t54] }, Ev8: { target: S.G6.L4, arm: [t54, t66] }, Ev9: { target: S.G6.L4, arm: [t66, t78] } } }, L4: { on: { Ev8: { target: S.G6.L0, arm: [t54, t66] }, Ev9: { target: S.G6.L0, arm: [t66, t78] }, Ev10: { target: S.G6.L0, arm: [t78, t6] } } } } },
G7: { default: S.G7.L0, schedules: { t7, t19, t31, t43, t55, t67, t79 }, on: { Ev0: { target: "self", arm: [t7, t19], disarm: [t31, t43] }, Ev1: { target: "self", arm: [t19, t31], disarm: [t43, t55] }, Ev2: { target: "self", arm: [t31, t43], disarm: [t55, t67] }, Ev3: { target: "self", arm: [t43, t55], disarm: [t67, t79] } }, states: { L0: { on: { Ev4: { target: S.G7.L1, arm: [t7, t19] }, Ev5: { target: S.G7.L1, arm: [t19, t31] }, Ev6: { target: S.G7.L1, arm: [t31, t43] } } }, L1: { on: { Ev5: { target: S.G7.L2, arm: [t19, t31] }, Ev6: { target: S.G7.L2, arm: [t31, t43] }, Ev7: { target: S.G7.L2, arm: [t43, t55] } } }, L2: { on: { Ev6: { target: S.G7.L3, arm: [t31, t43] }, Ev7: { target: S.G7.L3, arm: [t43, t55] }, Ev8: { target: S.G7.L3, arm: [t55, t67] } } }, L3: { on: { Ev7: { target: S.G7.L4, arm: [t43, t55] }, Ev8: { target: S.G7.L4, arm: [t55, t67] }, Ev9: { target: S.G7.L4, arm: [t67, t79] } } }, L4: { on: { Ev8: { target: S.G7.L0, arm: [t55, t67] }, Ev9: { target: S.G7.L0, arm: [t67, t79] }, Ev10: { target: S.G7.L0, arm: [t79, t7] } } } } },
G8: { default: S.G8.L0, schedules: { t8, t20, t32, t44, t56, t68 }, on: { Ev0: { target: "self", arm: [t8, t20], disarm: [t32, t44] }, Ev1: { target: "self", arm: [t20, t32], disarm: [t44, t56] }, Ev2: { target: "self", arm: [t32, t44], disarm: [t56, t68] }, Ev3: { target: "self", arm: [t44, t56], disarm: [t68, t8] } }, states: { L0: { on: { Ev4: { target: S.G8.L1, arm: [t8, t20] }, Ev5: { target: S.G8.L1, arm: [t20, t32] }, Ev6: { target: S.G8.L1, arm: [t32, t44] } } }, L1: { on: { Ev5: { target: S.G8.L2, arm: [t20, t32] }, Ev6: { target: S.G8.L2, arm: [t32, t44] }, Ev7: { target: S.G8.L2, arm: [t44, t56] } } }, L2: { on: { Ev6: { target: S.G8.L3, arm: [t32, t44] }, Ev7: { target: S.G8.L3, arm: [t44, t56] }, Ev8: { target: S.G8.L3, arm: [t56, t68] } } }, L3: { on: { Ev7: { target: S.G8.L4, arm: [t44, t56] }, Ev8: { target: S.G8.L4, arm: [t56, t68] }, Ev9: { target: S.G8.L4, arm: [t68, t8] } } }, L4: { on: { Ev8: { target: S.G8.L0, arm: [t56, t68] }, Ev9: { target: S.G8.L0, arm: [t68, t8] }, Ev10: { target: S.G8.L0, arm: [t8, t20] } } } } },
G9: { default: S.G9.L0, schedules: { t9, t21, t33, t45, t57, t69 }, on: { Ev0: { target: "self", arm: [t9, t21], disarm: [t33, t45] }, Ev1: { target: "self", arm: [t21, t33], disarm: [t45, t57] }, Ev2: { target: "self", arm: [t33, t45], disarm: [t57, t69] }, Ev3: { target: "self", arm: [t45, t57], disarm: [t69, t9] } }, states: { L0: { on: { Ev4: { target: S.G9.L1, arm: [t9, t21] }, Ev5: { target: S.G9.L1, arm: [t21, t33] }, Ev6: { target: S.G9.L1, arm: [t33, t45] } } }, L1: { on: { Ev5: { target: S.G9.L2, arm: [t21, t33] }, Ev6: { target: S.G9.L2, arm: [t33, t45] }, Ev7: { target: S.G9.L2, arm: [t45, t57] } } }, L2: { on: { Ev6: { target: S.G9.L3, arm: [t33, t45] }, Ev7: { target: S.G9.L3, arm: [t45, t57] }, Ev8: { target: S.G9.L3, arm: [t57, t69] } } }, L3: { on: { Ev7: { target: S.G9.L4, arm: [t45, t57] }, Ev8: { target: S.G9.L4, arm: [t57, t69] }, Ev9: { target: S.G9.L4, arm: [t69, t9] } } }, L4: { on: { Ev8: { target: S.G9.L0, arm: [t57, t69] }, Ev9: { target: S.G9.L0, arm: [t69, t9] }, Ev10: { target: S.G9.L0, arm: [t9, t21] } } } } },
G10: { default: S.G10.L0, schedules: { t10, t22, t34, t46, t58, t70 }, on: { Ev0: { target: "self", arm: [t10, t22], disarm: [t34, t46] }, Ev1: { target: "self", arm: [t22, t34], disarm: [t46, t58] }, Ev2: { target: "self", arm: [t34, t46], disarm: [t58, t70] }, Ev3: { target: "self", arm: [t46, t58], disarm: [t70, t10] } }, states: { L0: { on: { Ev4: { target: S.G10.L1, arm: [t10, t22] }, Ev5: { target: S.G10.L1, arm: [t22, t34] }, Ev6: { target: S.G10.L1, arm: [t34, t46] } } }, L1: { on: { Ev5: { target: S.G10.L2, arm: [t22, t34] }, Ev6: { target: S.G10.L2, arm: [t34, t46] }, Ev7: { target: S.G10.L2, arm: [t46, t58] } } }, L2: { on: { Ev6: { target: S.G10.L3, arm: [t34, t46] }, Ev7: { target: S.G10.L3, arm: [t46, t58] }, Ev8: { target: S.G10.L3, arm: [t58, t70] } } }, L3: { on: { Ev7: { target: S.G10.L4, arm: [t46, t58] }, Ev8: { target: S.G10.L4, arm: [t58, t70] }, Ev9: { target: S.G10.L4, arm: [t70, t10] } } }, L4: { on: { Ev8: { target: S.G10.L0, arm: [t58, t70] }, Ev9: { target: S.G10.L0, arm: [t70, t10] }, Ev10: { target: S.G10.L0, arm: [t10, t22] } } } } },
G11: { default: S.G11.L0, schedules: { t11, t23, t35, t47, t59, t71 }, on: { Ev0: { target: "self", arm: [t11, t23], disarm: [t35, t47] }, Ev1: { target: "self", arm: [t23, t35], disarm: [t47, t59] }, Ev2: { target: "self", arm: [t35, t47], disarm: [t59, t71] }, Ev3: { target: "self", arm: [t47, t59], disarm: [t71, t11] } }, states: { L0: { on: { Ev4: { target: S.G11.L1, arm: [t11, t23] }, Ev5: { target: S.G11.L1, arm: [t23, t35] }, Ev6: { target: S.G11.L1, arm: [t35, t47] } } }, L1: { on: { Ev5: { target: S.G11.L2, arm: [t23, t35] }, Ev6: { target: S.G11.L2, arm: [t35, t47] }, Ev7: { target: S.G11.L2, arm: [t47, t59] } } }, L2: { on: { Ev6: { target: S.G11.L3, arm: [t35, t47] }, Ev7: { target: S.G11.L3, arm: [t47, t59] }, Ev8: { target: S.G11.L3, arm: [t59, t71] } } }, L3: { on: { Ev7: { target: S.G11.L4, arm: [t47, t59] }, Ev8: { target: S.G11.L4, arm: [t59, t71] }, Ev9: { target: S.G11.L4, arm: [t71, t11] } } }, L4: { on: { Ev8: { target: S.G11.L0, arm: [t59, t71] }, Ev9: { target: S.G11.L0, arm: [t71, t11] }, Ev10: { target: S.G11.L0, arm: [t11, t23] } } } } },
} }));
export const v = m.snapshot.schedules.t0;
