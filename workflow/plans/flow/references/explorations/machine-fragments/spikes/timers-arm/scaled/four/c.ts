import { definition, tokens } from "../../src/core.ts";
import { machine, timer } from "../../src/c.ts";
const D = definition({ id: "X", states: [{ G0: ["L0", "L1", "L2", "L3", "L4"] }, { G1: ["L0", "L1", "L2", "L3", "L4"] }, { G2: ["L0", "L1", "L2", "L3", "L4"] }, { G3: ["L0", "L1", "L2", "L3", "L4"] }, { G4: ["L0", "L1", "L2", "L3", "L4"] }, { G5: ["L0", "L1", "L2", "L3", "L4"] }, { G6: ["L0", "L1", "L2", "L3", "L4"] }, { G7: ["L0", "L1", "L2", "L3", "L4"] }, { G8: ["L0", "L1", "L2", "L3", "L4"] }, { G9: ["L0", "L1", "L2", "L3", "L4"] }, { G10: ["L0", "L1", "L2", "L3", "L4"] }, { G11: ["L0", "L1", "L2", "L3", "L4"] }, { G12: ["L0", "L1", "L2", "L3", "L4"] }, { G13: ["L0", "L1", "L2", "L3", "L4"] }, { G14: ["L0", "L1", "L2", "L3", "L4"] }, { G15: ["L0", "L1", "L2", "L3", "L4"] }, { G16: ["L0", "L1", "L2", "L3", "L4"] }, { G17: ["L0", "L1", "L2", "L3", "L4"] }, { G18: ["L0", "L1", "L2", "L3", "L4"] }, { G19: ["L0", "L1", "L2", "L3", "L4"] }, { G20: ["L0", "L1", "L2", "L3", "L4"] }, { G21: ["L0", "L1", "L2", "L3", "L4"] }, { G22: ["L0", "L1", "L2", "L3", "L4"] }, { G23: ["L0", "L1", "L2", "L3", "L4"] }], events: { Ev0: {}, Ev1: {}, Ev2: {}, Ev3: {}, Ev4: {}, Ev5: {}, Ev6: {}, Ev7: {}, Ev8: {}, Ev9: {}, Ev10: {}, Ev11: {}, Ev12: {}, Ev13: {}, Ev14: {}, Ev15: {}, Ev16: {}, Ev17: {}, Ev18: {}, Ev19: {} }, internalEvents: { T0Done: {}, T1Done: {}, T2Done: {}, T3Done: {}, T4Done: {}, T5Done: {}, T6Done: {}, T7Done: {}, T8Done: {}, T9Done: {}, T10Done: {}, T11Done: {}, T12Done: {}, T13Done: {}, T14Done: {}, T15Done: {}, T16Done: {}, T17Done: {}, T18Done: {}, T19Done: {}, T20Done: {}, T21Done: {}, T22Done: {}, T23Done: {}, T24Done: {}, T25Done: {}, T26Done: {}, T27Done: {}, T28Done: {}, T29Done: {}, T30Done: {}, T31Done: {}, T32Done: {}, T33Done: {}, T34Done: {}, T35Done: {}, T36Done: {}, T37Done: {}, T38Done: {}, T39Done: {}, T40Done: {}, T41Done: {}, T42Done: {}, T43Done: {}, T44Done: {}, T45Done: {}, T46Done: {}, T47Done: {}, T48Done: {}, T49Done: {}, T50Done: {}, T51Done: {}, T52Done: {}, T53Done: {}, T54Done: {}, T55Done: {}, T56Done: {}, T57Done: {}, T58Done: {}, T59Done: {}, T60Done: {}, T61Done: {}, T62Done: {}, T63Done: {}, T64Done: {}, T65Done: {}, T66Done: {}, T67Done: {}, T68Done: {}, T69Done: {}, T70Done: {}, T71Done: {}, T72Done: {}, T73Done: {}, T74Done: {}, T75Done: {}, T76Done: {}, T77Done: {}, T78Done: {}, T79Done: {}, T80Done: {}, T81Done: {}, T82Done: {}, T83Done: {}, T84Done: {}, T85Done: {}, T86Done: {}, T87Done: {}, T88Done: {}, T89Done: {}, T90Done: {}, T91Done: {}, T92Done: {}, T93Done: {}, T94Done: {}, T95Done: {}, T96Done: {}, T97Done: {}, T98Done: {}, T99Done: {}, T100Done: {}, T101Done: {}, T102Done: {}, T103Done: {}, T104Done: {}, T105Done: {}, T106Done: {}, T107Done: {}, T108Done: {}, T109Done: {}, T110Done: {}, T111Done: {}, T112Done: {}, T113Done: {}, T114Done: {}, T115Done: {}, T116Done: {}, T117Done: {}, T118Done: {}, T119Done: {}, T120Done: {}, T121Done: {}, T122Done: {}, T123Done: {}, T124Done: {}, T125Done: {}, T126Done: {}, T127Done: {}, T128Done: {}, T129Done: {}, T130Done: {}, T131Done: {}, T132Done: {}, T133Done: {}, T134Done: {}, T135Done: {}, T136Done: {}, T137Done: {}, T138Done: {}, T139Done: {}, T140Done: {}, T141Done: {}, T142Done: {}, T143Done: {}, T144Done: {}, T145Done: {}, T146Done: {}, T147Done: {}, T148Done: {}, T149Done: {}, T150Done: {}, T151Done: {}, T152Done: {}, T153Done: {}, T154Done: {}, T155Done: {}, T156Done: {}, T157Done: {}, T158Done: {}, T159Done: {} } });
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
const t80 = timer("81 seconds", E0.T80Done);
const t81 = timer("82 seconds", E0.T81Done);
const t82 = timer("83 seconds", E0.T82Done);
const t83 = timer("84 seconds", E0.T83Done);
const t84 = timer("85 seconds", E0.T84Done);
const t85 = timer("86 seconds", E0.T85Done);
const t86 = timer("87 seconds", E0.T86Done);
const t87 = timer("88 seconds", E0.T87Done);
const t88 = timer("89 seconds", E0.T88Done);
const t89 = timer("90 seconds", E0.T89Done);
const t90 = timer("91 seconds", E0.T90Done);
const t91 = timer("92 seconds", E0.T91Done);
const t92 = timer("93 seconds", E0.T92Done);
const t93 = timer("94 seconds", E0.T93Done);
const t94 = timer("95 seconds", E0.T94Done);
const t95 = timer("96 seconds", E0.T95Done);
const t96 = timer("97 seconds", E0.T96Done);
const t97 = timer("98 seconds", E0.T97Done);
const t98 = timer("99 seconds", E0.T98Done);
const t99 = timer("100 seconds", E0.T99Done);
const t100 = timer("101 seconds", E0.T100Done);
const t101 = timer("102 seconds", E0.T101Done);
const t102 = timer("103 seconds", E0.T102Done);
const t103 = timer("104 seconds", E0.T103Done);
const t104 = timer("105 seconds", E0.T104Done);
const t105 = timer("106 seconds", E0.T105Done);
const t106 = timer("107 seconds", E0.T106Done);
const t107 = timer("108 seconds", E0.T107Done);
const t108 = timer("109 seconds", E0.T108Done);
const t109 = timer("110 seconds", E0.T109Done);
const t110 = timer("111 seconds", E0.T110Done);
const t111 = timer("112 seconds", E0.T111Done);
const t112 = timer("113 seconds", E0.T112Done);
const t113 = timer("114 seconds", E0.T113Done);
const t114 = timer("115 seconds", E0.T114Done);
const t115 = timer("116 seconds", E0.T115Done);
const t116 = timer("117 seconds", E0.T116Done);
const t117 = timer("118 seconds", E0.T117Done);
const t118 = timer("119 seconds", E0.T118Done);
const t119 = timer("120 seconds", E0.T119Done);
const t120 = timer("121 seconds", E0.T120Done);
const t121 = timer("122 seconds", E0.T121Done);
const t122 = timer("123 seconds", E0.T122Done);
const t123 = timer("124 seconds", E0.T123Done);
const t124 = timer("125 seconds", E0.T124Done);
const t125 = timer("126 seconds", E0.T125Done);
const t126 = timer("127 seconds", E0.T126Done);
const t127 = timer("128 seconds", E0.T127Done);
const t128 = timer("129 seconds", E0.T128Done);
const t129 = timer("130 seconds", E0.T129Done);
const t130 = timer("131 seconds", E0.T130Done);
const t131 = timer("132 seconds", E0.T131Done);
const t132 = timer("133 seconds", E0.T132Done);
const t133 = timer("134 seconds", E0.T133Done);
const t134 = timer("135 seconds", E0.T134Done);
const t135 = timer("136 seconds", E0.T135Done);
const t136 = timer("137 seconds", E0.T136Done);
const t137 = timer("138 seconds", E0.T137Done);
const t138 = timer("139 seconds", E0.T138Done);
const t139 = timer("140 seconds", E0.T139Done);
const t140 = timer("141 seconds", E0.T140Done);
const t141 = timer("142 seconds", E0.T141Done);
const t142 = timer("143 seconds", E0.T142Done);
const t143 = timer("144 seconds", E0.T143Done);
const t144 = timer("145 seconds", E0.T144Done);
const t145 = timer("146 seconds", E0.T145Done);
const t146 = timer("147 seconds", E0.T146Done);
const t147 = timer("148 seconds", E0.T147Done);
const t148 = timer("149 seconds", E0.T148Done);
const t149 = timer("150 seconds", E0.T149Done);
const t150 = timer("151 seconds", E0.T150Done);
const t151 = timer("152 seconds", E0.T151Done);
const t152 = timer("153 seconds", E0.T152Done);
const t153 = timer("154 seconds", E0.T153Done);
const t154 = timer("155 seconds", E0.T154Done);
const t155 = timer("156 seconds", E0.T155Done);
const t156 = timer("157 seconds", E0.T156Done);
const t157 = timer("158 seconds", E0.T157Done);
const t158 = timer("159 seconds", E0.T158Done);
const t159 = timer("160 seconds", E0.T159Done);
export const m = machine(D, ({ S, E }) => ({
 default: S.G0,
 states: {
G0: { default: S.G0.L0, schedules: { t0, t24, t48, t72, t96, t120, t144 }, on: { Ev0: { target: "self", arm: [t0, t24], disarm: [t48, t72] }, Ev1: { target: "self", arm: [t24, t48], disarm: [t72, t96] }, Ev2: { target: "self", arm: [t48, t72], disarm: [t96, t120] }, Ev3: { target: "self", arm: [t72, t96], disarm: [t120, t144] } }, states: { L0: { on: { Ev4: { target: S.G0.L1, arm: [t0, t24] }, Ev5: { target: S.G0.L1, arm: [t24, t48] }, Ev6: { target: S.G0.L1, arm: [t48, t72] } } }, L1: { on: { Ev5: { target: S.G0.L2, arm: [t24, t48] }, Ev6: { target: S.G0.L2, arm: [t48, t72] }, Ev7: { target: S.G0.L2, arm: [t72, t96] } } }, L2: { on: { Ev6: { target: S.G0.L3, arm: [t48, t72] }, Ev7: { target: S.G0.L3, arm: [t72, t96] }, Ev8: { target: S.G0.L3, arm: [t96, t120] } } }, L3: { on: { Ev7: { target: S.G0.L4, arm: [t72, t96] }, Ev8: { target: S.G0.L4, arm: [t96, t120] }, Ev9: { target: S.G0.L4, arm: [t120, t144] } } }, L4: { on: { Ev8: { target: S.G0.L0, arm: [t96, t120] }, Ev9: { target: S.G0.L0, arm: [t120, t144] }, Ev10: { target: S.G0.L0, arm: [t144, t0] } } } } },
G1: { default: S.G1.L0, schedules: { t1, t25, t49, t73, t97, t121, t145 }, on: { Ev0: { target: "self", arm: [t1, t25], disarm: [t49, t73] }, Ev1: { target: "self", arm: [t25, t49], disarm: [t73, t97] }, Ev2: { target: "self", arm: [t49, t73], disarm: [t97, t121] }, Ev3: { target: "self", arm: [t73, t97], disarm: [t121, t145] } }, states: { L0: { on: { Ev4: { target: S.G1.L1, arm: [t1, t25] }, Ev5: { target: S.G1.L1, arm: [t25, t49] }, Ev6: { target: S.G1.L1, arm: [t49, t73] } } }, L1: { on: { Ev5: { target: S.G1.L2, arm: [t25, t49] }, Ev6: { target: S.G1.L2, arm: [t49, t73] }, Ev7: { target: S.G1.L2, arm: [t73, t97] } } }, L2: { on: { Ev6: { target: S.G1.L3, arm: [t49, t73] }, Ev7: { target: S.G1.L3, arm: [t73, t97] }, Ev8: { target: S.G1.L3, arm: [t97, t121] } } }, L3: { on: { Ev7: { target: S.G1.L4, arm: [t73, t97] }, Ev8: { target: S.G1.L4, arm: [t97, t121] }, Ev9: { target: S.G1.L4, arm: [t121, t145] } } }, L4: { on: { Ev8: { target: S.G1.L0, arm: [t97, t121] }, Ev9: { target: S.G1.L0, arm: [t121, t145] }, Ev10: { target: S.G1.L0, arm: [t145, t1] } } } } },
G2: { default: S.G2.L0, schedules: { t2, t26, t50, t74, t98, t122, t146 }, on: { Ev0: { target: "self", arm: [t2, t26], disarm: [t50, t74] }, Ev1: { target: "self", arm: [t26, t50], disarm: [t74, t98] }, Ev2: { target: "self", arm: [t50, t74], disarm: [t98, t122] }, Ev3: { target: "self", arm: [t74, t98], disarm: [t122, t146] } }, states: { L0: { on: { Ev4: { target: S.G2.L1, arm: [t2, t26] }, Ev5: { target: S.G2.L1, arm: [t26, t50] }, Ev6: { target: S.G2.L1, arm: [t50, t74] } } }, L1: { on: { Ev5: { target: S.G2.L2, arm: [t26, t50] }, Ev6: { target: S.G2.L2, arm: [t50, t74] }, Ev7: { target: S.G2.L2, arm: [t74, t98] } } }, L2: { on: { Ev6: { target: S.G2.L3, arm: [t50, t74] }, Ev7: { target: S.G2.L3, arm: [t74, t98] }, Ev8: { target: S.G2.L3, arm: [t98, t122] } } }, L3: { on: { Ev7: { target: S.G2.L4, arm: [t74, t98] }, Ev8: { target: S.G2.L4, arm: [t98, t122] }, Ev9: { target: S.G2.L4, arm: [t122, t146] } } }, L4: { on: { Ev8: { target: S.G2.L0, arm: [t98, t122] }, Ev9: { target: S.G2.L0, arm: [t122, t146] }, Ev10: { target: S.G2.L0, arm: [t146, t2] } } } } },
G3: { default: S.G3.L0, schedules: { t3, t27, t51, t75, t99, t123, t147 }, on: { Ev0: { target: "self", arm: [t3, t27], disarm: [t51, t75] }, Ev1: { target: "self", arm: [t27, t51], disarm: [t75, t99] }, Ev2: { target: "self", arm: [t51, t75], disarm: [t99, t123] }, Ev3: { target: "self", arm: [t75, t99], disarm: [t123, t147] } }, states: { L0: { on: { Ev4: { target: S.G3.L1, arm: [t3, t27] }, Ev5: { target: S.G3.L1, arm: [t27, t51] }, Ev6: { target: S.G3.L1, arm: [t51, t75] } } }, L1: { on: { Ev5: { target: S.G3.L2, arm: [t27, t51] }, Ev6: { target: S.G3.L2, arm: [t51, t75] }, Ev7: { target: S.G3.L2, arm: [t75, t99] } } }, L2: { on: { Ev6: { target: S.G3.L3, arm: [t51, t75] }, Ev7: { target: S.G3.L3, arm: [t75, t99] }, Ev8: { target: S.G3.L3, arm: [t99, t123] } } }, L3: { on: { Ev7: { target: S.G3.L4, arm: [t75, t99] }, Ev8: { target: S.G3.L4, arm: [t99, t123] }, Ev9: { target: S.G3.L4, arm: [t123, t147] } } }, L4: { on: { Ev8: { target: S.G3.L0, arm: [t99, t123] }, Ev9: { target: S.G3.L0, arm: [t123, t147] }, Ev10: { target: S.G3.L0, arm: [t147, t3] } } } } },
G4: { default: S.G4.L0, schedules: { t4, t28, t52, t76, t100, t124, t148 }, on: { Ev0: { target: "self", arm: [t4, t28], disarm: [t52, t76] }, Ev1: { target: "self", arm: [t28, t52], disarm: [t76, t100] }, Ev2: { target: "self", arm: [t52, t76], disarm: [t100, t124] }, Ev3: { target: "self", arm: [t76, t100], disarm: [t124, t148] } }, states: { L0: { on: { Ev4: { target: S.G4.L1, arm: [t4, t28] }, Ev5: { target: S.G4.L1, arm: [t28, t52] }, Ev6: { target: S.G4.L1, arm: [t52, t76] } } }, L1: { on: { Ev5: { target: S.G4.L2, arm: [t28, t52] }, Ev6: { target: S.G4.L2, arm: [t52, t76] }, Ev7: { target: S.G4.L2, arm: [t76, t100] } } }, L2: { on: { Ev6: { target: S.G4.L3, arm: [t52, t76] }, Ev7: { target: S.G4.L3, arm: [t76, t100] }, Ev8: { target: S.G4.L3, arm: [t100, t124] } } }, L3: { on: { Ev7: { target: S.G4.L4, arm: [t76, t100] }, Ev8: { target: S.G4.L4, arm: [t100, t124] }, Ev9: { target: S.G4.L4, arm: [t124, t148] } } }, L4: { on: { Ev8: { target: S.G4.L0, arm: [t100, t124] }, Ev9: { target: S.G4.L0, arm: [t124, t148] }, Ev10: { target: S.G4.L0, arm: [t148, t4] } } } } },
G5: { default: S.G5.L0, schedules: { t5, t29, t53, t77, t101, t125, t149 }, on: { Ev0: { target: "self", arm: [t5, t29], disarm: [t53, t77] }, Ev1: { target: "self", arm: [t29, t53], disarm: [t77, t101] }, Ev2: { target: "self", arm: [t53, t77], disarm: [t101, t125] }, Ev3: { target: "self", arm: [t77, t101], disarm: [t125, t149] } }, states: { L0: { on: { Ev4: { target: S.G5.L1, arm: [t5, t29] }, Ev5: { target: S.G5.L1, arm: [t29, t53] }, Ev6: { target: S.G5.L1, arm: [t53, t77] } } }, L1: { on: { Ev5: { target: S.G5.L2, arm: [t29, t53] }, Ev6: { target: S.G5.L2, arm: [t53, t77] }, Ev7: { target: S.G5.L2, arm: [t77, t101] } } }, L2: { on: { Ev6: { target: S.G5.L3, arm: [t53, t77] }, Ev7: { target: S.G5.L3, arm: [t77, t101] }, Ev8: { target: S.G5.L3, arm: [t101, t125] } } }, L3: { on: { Ev7: { target: S.G5.L4, arm: [t77, t101] }, Ev8: { target: S.G5.L4, arm: [t101, t125] }, Ev9: { target: S.G5.L4, arm: [t125, t149] } } }, L4: { on: { Ev8: { target: S.G5.L0, arm: [t101, t125] }, Ev9: { target: S.G5.L0, arm: [t125, t149] }, Ev10: { target: S.G5.L0, arm: [t149, t5] } } } } },
G6: { default: S.G6.L0, schedules: { t6, t30, t54, t78, t102, t126, t150 }, on: { Ev0: { target: "self", arm: [t6, t30], disarm: [t54, t78] }, Ev1: { target: "self", arm: [t30, t54], disarm: [t78, t102] }, Ev2: { target: "self", arm: [t54, t78], disarm: [t102, t126] }, Ev3: { target: "self", arm: [t78, t102], disarm: [t126, t150] } }, states: { L0: { on: { Ev4: { target: S.G6.L1, arm: [t6, t30] }, Ev5: { target: S.G6.L1, arm: [t30, t54] }, Ev6: { target: S.G6.L1, arm: [t54, t78] } } }, L1: { on: { Ev5: { target: S.G6.L2, arm: [t30, t54] }, Ev6: { target: S.G6.L2, arm: [t54, t78] }, Ev7: { target: S.G6.L2, arm: [t78, t102] } } }, L2: { on: { Ev6: { target: S.G6.L3, arm: [t54, t78] }, Ev7: { target: S.G6.L3, arm: [t78, t102] }, Ev8: { target: S.G6.L3, arm: [t102, t126] } } }, L3: { on: { Ev7: { target: S.G6.L4, arm: [t78, t102] }, Ev8: { target: S.G6.L4, arm: [t102, t126] }, Ev9: { target: S.G6.L4, arm: [t126, t150] } } }, L4: { on: { Ev8: { target: S.G6.L0, arm: [t102, t126] }, Ev9: { target: S.G6.L0, arm: [t126, t150] }, Ev10: { target: S.G6.L0, arm: [t150, t6] } } } } },
G7: { default: S.G7.L0, schedules: { t7, t31, t55, t79, t103, t127, t151 }, on: { Ev0: { target: "self", arm: [t7, t31], disarm: [t55, t79] }, Ev1: { target: "self", arm: [t31, t55], disarm: [t79, t103] }, Ev2: { target: "self", arm: [t55, t79], disarm: [t103, t127] }, Ev3: { target: "self", arm: [t79, t103], disarm: [t127, t151] } }, states: { L0: { on: { Ev4: { target: S.G7.L1, arm: [t7, t31] }, Ev5: { target: S.G7.L1, arm: [t31, t55] }, Ev6: { target: S.G7.L1, arm: [t55, t79] } } }, L1: { on: { Ev5: { target: S.G7.L2, arm: [t31, t55] }, Ev6: { target: S.G7.L2, arm: [t55, t79] }, Ev7: { target: S.G7.L2, arm: [t79, t103] } } }, L2: { on: { Ev6: { target: S.G7.L3, arm: [t55, t79] }, Ev7: { target: S.G7.L3, arm: [t79, t103] }, Ev8: { target: S.G7.L3, arm: [t103, t127] } } }, L3: { on: { Ev7: { target: S.G7.L4, arm: [t79, t103] }, Ev8: { target: S.G7.L4, arm: [t103, t127] }, Ev9: { target: S.G7.L4, arm: [t127, t151] } } }, L4: { on: { Ev8: { target: S.G7.L0, arm: [t103, t127] }, Ev9: { target: S.G7.L0, arm: [t127, t151] }, Ev10: { target: S.G7.L0, arm: [t151, t7] } } } } },
G8: { default: S.G8.L0, schedules: { t8, t32, t56, t80, t104, t128, t152 }, on: { Ev0: { target: "self", arm: [t8, t32], disarm: [t56, t80] }, Ev1: { target: "self", arm: [t32, t56], disarm: [t80, t104] }, Ev2: { target: "self", arm: [t56, t80], disarm: [t104, t128] }, Ev3: { target: "self", arm: [t80, t104], disarm: [t128, t152] } }, states: { L0: { on: { Ev4: { target: S.G8.L1, arm: [t8, t32] }, Ev5: { target: S.G8.L1, arm: [t32, t56] }, Ev6: { target: S.G8.L1, arm: [t56, t80] } } }, L1: { on: { Ev5: { target: S.G8.L2, arm: [t32, t56] }, Ev6: { target: S.G8.L2, arm: [t56, t80] }, Ev7: { target: S.G8.L2, arm: [t80, t104] } } }, L2: { on: { Ev6: { target: S.G8.L3, arm: [t56, t80] }, Ev7: { target: S.G8.L3, arm: [t80, t104] }, Ev8: { target: S.G8.L3, arm: [t104, t128] } } }, L3: { on: { Ev7: { target: S.G8.L4, arm: [t80, t104] }, Ev8: { target: S.G8.L4, arm: [t104, t128] }, Ev9: { target: S.G8.L4, arm: [t128, t152] } } }, L4: { on: { Ev8: { target: S.G8.L0, arm: [t104, t128] }, Ev9: { target: S.G8.L0, arm: [t128, t152] }, Ev10: { target: S.G8.L0, arm: [t152, t8] } } } } },
G9: { default: S.G9.L0, schedules: { t9, t33, t57, t81, t105, t129, t153 }, on: { Ev0: { target: "self", arm: [t9, t33], disarm: [t57, t81] }, Ev1: { target: "self", arm: [t33, t57], disarm: [t81, t105] }, Ev2: { target: "self", arm: [t57, t81], disarm: [t105, t129] }, Ev3: { target: "self", arm: [t81, t105], disarm: [t129, t153] } }, states: { L0: { on: { Ev4: { target: S.G9.L1, arm: [t9, t33] }, Ev5: { target: S.G9.L1, arm: [t33, t57] }, Ev6: { target: S.G9.L1, arm: [t57, t81] } } }, L1: { on: { Ev5: { target: S.G9.L2, arm: [t33, t57] }, Ev6: { target: S.G9.L2, arm: [t57, t81] }, Ev7: { target: S.G9.L2, arm: [t81, t105] } } }, L2: { on: { Ev6: { target: S.G9.L3, arm: [t57, t81] }, Ev7: { target: S.G9.L3, arm: [t81, t105] }, Ev8: { target: S.G9.L3, arm: [t105, t129] } } }, L3: { on: { Ev7: { target: S.G9.L4, arm: [t81, t105] }, Ev8: { target: S.G9.L4, arm: [t105, t129] }, Ev9: { target: S.G9.L4, arm: [t129, t153] } } }, L4: { on: { Ev8: { target: S.G9.L0, arm: [t105, t129] }, Ev9: { target: S.G9.L0, arm: [t129, t153] }, Ev10: { target: S.G9.L0, arm: [t153, t9] } } } } },
G10: { default: S.G10.L0, schedules: { t10, t34, t58, t82, t106, t130, t154 }, on: { Ev0: { target: "self", arm: [t10, t34], disarm: [t58, t82] }, Ev1: { target: "self", arm: [t34, t58], disarm: [t82, t106] }, Ev2: { target: "self", arm: [t58, t82], disarm: [t106, t130] }, Ev3: { target: "self", arm: [t82, t106], disarm: [t130, t154] } }, states: { L0: { on: { Ev4: { target: S.G10.L1, arm: [t10, t34] }, Ev5: { target: S.G10.L1, arm: [t34, t58] }, Ev6: { target: S.G10.L1, arm: [t58, t82] } } }, L1: { on: { Ev5: { target: S.G10.L2, arm: [t34, t58] }, Ev6: { target: S.G10.L2, arm: [t58, t82] }, Ev7: { target: S.G10.L2, arm: [t82, t106] } } }, L2: { on: { Ev6: { target: S.G10.L3, arm: [t58, t82] }, Ev7: { target: S.G10.L3, arm: [t82, t106] }, Ev8: { target: S.G10.L3, arm: [t106, t130] } } }, L3: { on: { Ev7: { target: S.G10.L4, arm: [t82, t106] }, Ev8: { target: S.G10.L4, arm: [t106, t130] }, Ev9: { target: S.G10.L4, arm: [t130, t154] } } }, L4: { on: { Ev8: { target: S.G10.L0, arm: [t106, t130] }, Ev9: { target: S.G10.L0, arm: [t130, t154] }, Ev10: { target: S.G10.L0, arm: [t154, t10] } } } } },
G11: { default: S.G11.L0, schedules: { t11, t35, t59, t83, t107, t131, t155 }, on: { Ev0: { target: "self", arm: [t11, t35], disarm: [t59, t83] }, Ev1: { target: "self", arm: [t35, t59], disarm: [t83, t107] }, Ev2: { target: "self", arm: [t59, t83], disarm: [t107, t131] }, Ev3: { target: "self", arm: [t83, t107], disarm: [t131, t155] } }, states: { L0: { on: { Ev4: { target: S.G11.L1, arm: [t11, t35] }, Ev5: { target: S.G11.L1, arm: [t35, t59] }, Ev6: { target: S.G11.L1, arm: [t59, t83] } } }, L1: { on: { Ev5: { target: S.G11.L2, arm: [t35, t59] }, Ev6: { target: S.G11.L2, arm: [t59, t83] }, Ev7: { target: S.G11.L2, arm: [t83, t107] } } }, L2: { on: { Ev6: { target: S.G11.L3, arm: [t59, t83] }, Ev7: { target: S.G11.L3, arm: [t83, t107] }, Ev8: { target: S.G11.L3, arm: [t107, t131] } } }, L3: { on: { Ev7: { target: S.G11.L4, arm: [t83, t107] }, Ev8: { target: S.G11.L4, arm: [t107, t131] }, Ev9: { target: S.G11.L4, arm: [t131, t155] } } }, L4: { on: { Ev8: { target: S.G11.L0, arm: [t107, t131] }, Ev9: { target: S.G11.L0, arm: [t131, t155] }, Ev10: { target: S.G11.L0, arm: [t155, t11] } } } } },
G12: { default: S.G12.L0, schedules: { t12, t36, t60, t84, t108, t132, t156 }, on: { Ev0: { target: "self", arm: [t12, t36], disarm: [t60, t84] }, Ev1: { target: "self", arm: [t36, t60], disarm: [t84, t108] }, Ev2: { target: "self", arm: [t60, t84], disarm: [t108, t132] }, Ev3: { target: "self", arm: [t84, t108], disarm: [t132, t156] } }, states: { L0: { on: { Ev4: { target: S.G12.L1, arm: [t12, t36] }, Ev5: { target: S.G12.L1, arm: [t36, t60] }, Ev6: { target: S.G12.L1, arm: [t60, t84] } } }, L1: { on: { Ev5: { target: S.G12.L2, arm: [t36, t60] }, Ev6: { target: S.G12.L2, arm: [t60, t84] }, Ev7: { target: S.G12.L2, arm: [t84, t108] } } }, L2: { on: { Ev6: { target: S.G12.L3, arm: [t60, t84] }, Ev7: { target: S.G12.L3, arm: [t84, t108] }, Ev8: { target: S.G12.L3, arm: [t108, t132] } } }, L3: { on: { Ev7: { target: S.G12.L4, arm: [t84, t108] }, Ev8: { target: S.G12.L4, arm: [t108, t132] }, Ev9: { target: S.G12.L4, arm: [t132, t156] } } }, L4: { on: { Ev8: { target: S.G12.L0, arm: [t108, t132] }, Ev9: { target: S.G12.L0, arm: [t132, t156] }, Ev10: { target: S.G12.L0, arm: [t156, t12] } } } } },
G13: { default: S.G13.L0, schedules: { t13, t37, t61, t85, t109, t133, t157 }, on: { Ev0: { target: "self", arm: [t13, t37], disarm: [t61, t85] }, Ev1: { target: "self", arm: [t37, t61], disarm: [t85, t109] }, Ev2: { target: "self", arm: [t61, t85], disarm: [t109, t133] }, Ev3: { target: "self", arm: [t85, t109], disarm: [t133, t157] } }, states: { L0: { on: { Ev4: { target: S.G13.L1, arm: [t13, t37] }, Ev5: { target: S.G13.L1, arm: [t37, t61] }, Ev6: { target: S.G13.L1, arm: [t61, t85] } } }, L1: { on: { Ev5: { target: S.G13.L2, arm: [t37, t61] }, Ev6: { target: S.G13.L2, arm: [t61, t85] }, Ev7: { target: S.G13.L2, arm: [t85, t109] } } }, L2: { on: { Ev6: { target: S.G13.L3, arm: [t61, t85] }, Ev7: { target: S.G13.L3, arm: [t85, t109] }, Ev8: { target: S.G13.L3, arm: [t109, t133] } } }, L3: { on: { Ev7: { target: S.G13.L4, arm: [t85, t109] }, Ev8: { target: S.G13.L4, arm: [t109, t133] }, Ev9: { target: S.G13.L4, arm: [t133, t157] } } }, L4: { on: { Ev8: { target: S.G13.L0, arm: [t109, t133] }, Ev9: { target: S.G13.L0, arm: [t133, t157] }, Ev10: { target: S.G13.L0, arm: [t157, t13] } } } } },
G14: { default: S.G14.L0, schedules: { t14, t38, t62, t86, t110, t134, t158 }, on: { Ev0: { target: "self", arm: [t14, t38], disarm: [t62, t86] }, Ev1: { target: "self", arm: [t38, t62], disarm: [t86, t110] }, Ev2: { target: "self", arm: [t62, t86], disarm: [t110, t134] }, Ev3: { target: "self", arm: [t86, t110], disarm: [t134, t158] } }, states: { L0: { on: { Ev4: { target: S.G14.L1, arm: [t14, t38] }, Ev5: { target: S.G14.L1, arm: [t38, t62] }, Ev6: { target: S.G14.L1, arm: [t62, t86] } } }, L1: { on: { Ev5: { target: S.G14.L2, arm: [t38, t62] }, Ev6: { target: S.G14.L2, arm: [t62, t86] }, Ev7: { target: S.G14.L2, arm: [t86, t110] } } }, L2: { on: { Ev6: { target: S.G14.L3, arm: [t62, t86] }, Ev7: { target: S.G14.L3, arm: [t86, t110] }, Ev8: { target: S.G14.L3, arm: [t110, t134] } } }, L3: { on: { Ev7: { target: S.G14.L4, arm: [t86, t110] }, Ev8: { target: S.G14.L4, arm: [t110, t134] }, Ev9: { target: S.G14.L4, arm: [t134, t158] } } }, L4: { on: { Ev8: { target: S.G14.L0, arm: [t110, t134] }, Ev9: { target: S.G14.L0, arm: [t134, t158] }, Ev10: { target: S.G14.L0, arm: [t158, t14] } } } } },
G15: { default: S.G15.L0, schedules: { t15, t39, t63, t87, t111, t135, t159 }, on: { Ev0: { target: "self", arm: [t15, t39], disarm: [t63, t87] }, Ev1: { target: "self", arm: [t39, t63], disarm: [t87, t111] }, Ev2: { target: "self", arm: [t63, t87], disarm: [t111, t135] }, Ev3: { target: "self", arm: [t87, t111], disarm: [t135, t159] } }, states: { L0: { on: { Ev4: { target: S.G15.L1, arm: [t15, t39] }, Ev5: { target: S.G15.L1, arm: [t39, t63] }, Ev6: { target: S.G15.L1, arm: [t63, t87] } } }, L1: { on: { Ev5: { target: S.G15.L2, arm: [t39, t63] }, Ev6: { target: S.G15.L2, arm: [t63, t87] }, Ev7: { target: S.G15.L2, arm: [t87, t111] } } }, L2: { on: { Ev6: { target: S.G15.L3, arm: [t63, t87] }, Ev7: { target: S.G15.L3, arm: [t87, t111] }, Ev8: { target: S.G15.L3, arm: [t111, t135] } } }, L3: { on: { Ev7: { target: S.G15.L4, arm: [t87, t111] }, Ev8: { target: S.G15.L4, arm: [t111, t135] }, Ev9: { target: S.G15.L4, arm: [t135, t159] } } }, L4: { on: { Ev8: { target: S.G15.L0, arm: [t111, t135] }, Ev9: { target: S.G15.L0, arm: [t135, t159] }, Ev10: { target: S.G15.L0, arm: [t159, t15] } } } } },
G16: { default: S.G16.L0, schedules: { t16, t40, t64, t88, t112, t136 }, on: { Ev0: { target: "self", arm: [t16, t40], disarm: [t64, t88] }, Ev1: { target: "self", arm: [t40, t64], disarm: [t88, t112] }, Ev2: { target: "self", arm: [t64, t88], disarm: [t112, t136] }, Ev3: { target: "self", arm: [t88, t112], disarm: [t136, t16] } }, states: { L0: { on: { Ev4: { target: S.G16.L1, arm: [t16, t40] }, Ev5: { target: S.G16.L1, arm: [t40, t64] }, Ev6: { target: S.G16.L1, arm: [t64, t88] } } }, L1: { on: { Ev5: { target: S.G16.L2, arm: [t40, t64] }, Ev6: { target: S.G16.L2, arm: [t64, t88] }, Ev7: { target: S.G16.L2, arm: [t88, t112] } } }, L2: { on: { Ev6: { target: S.G16.L3, arm: [t64, t88] }, Ev7: { target: S.G16.L3, arm: [t88, t112] }, Ev8: { target: S.G16.L3, arm: [t112, t136] } } }, L3: { on: { Ev7: { target: S.G16.L4, arm: [t88, t112] }, Ev8: { target: S.G16.L4, arm: [t112, t136] }, Ev9: { target: S.G16.L4, arm: [t136, t16] } } }, L4: { on: { Ev8: { target: S.G16.L0, arm: [t112, t136] }, Ev9: { target: S.G16.L0, arm: [t136, t16] }, Ev10: { target: S.G16.L0, arm: [t16, t40] } } } } },
G17: { default: S.G17.L0, schedules: { t17, t41, t65, t89, t113, t137 }, on: { Ev0: { target: "self", arm: [t17, t41], disarm: [t65, t89] }, Ev1: { target: "self", arm: [t41, t65], disarm: [t89, t113] }, Ev2: { target: "self", arm: [t65, t89], disarm: [t113, t137] }, Ev3: { target: "self", arm: [t89, t113], disarm: [t137, t17] } }, states: { L0: { on: { Ev4: { target: S.G17.L1, arm: [t17, t41] }, Ev5: { target: S.G17.L1, arm: [t41, t65] }, Ev6: { target: S.G17.L1, arm: [t65, t89] } } }, L1: { on: { Ev5: { target: S.G17.L2, arm: [t41, t65] }, Ev6: { target: S.G17.L2, arm: [t65, t89] }, Ev7: { target: S.G17.L2, arm: [t89, t113] } } }, L2: { on: { Ev6: { target: S.G17.L3, arm: [t65, t89] }, Ev7: { target: S.G17.L3, arm: [t89, t113] }, Ev8: { target: S.G17.L3, arm: [t113, t137] } } }, L3: { on: { Ev7: { target: S.G17.L4, arm: [t89, t113] }, Ev8: { target: S.G17.L4, arm: [t113, t137] }, Ev9: { target: S.G17.L4, arm: [t137, t17] } } }, L4: { on: { Ev8: { target: S.G17.L0, arm: [t113, t137] }, Ev9: { target: S.G17.L0, arm: [t137, t17] }, Ev10: { target: S.G17.L0, arm: [t17, t41] } } } } },
G18: { default: S.G18.L0, schedules: { t18, t42, t66, t90, t114, t138 }, on: { Ev0: { target: "self", arm: [t18, t42], disarm: [t66, t90] }, Ev1: { target: "self", arm: [t42, t66], disarm: [t90, t114] }, Ev2: { target: "self", arm: [t66, t90], disarm: [t114, t138] }, Ev3: { target: "self", arm: [t90, t114], disarm: [t138, t18] } }, states: { L0: { on: { Ev4: { target: S.G18.L1, arm: [t18, t42] }, Ev5: { target: S.G18.L1, arm: [t42, t66] }, Ev6: { target: S.G18.L1, arm: [t66, t90] } } }, L1: { on: { Ev5: { target: S.G18.L2, arm: [t42, t66] }, Ev6: { target: S.G18.L2, arm: [t66, t90] }, Ev7: { target: S.G18.L2, arm: [t90, t114] } } }, L2: { on: { Ev6: { target: S.G18.L3, arm: [t66, t90] }, Ev7: { target: S.G18.L3, arm: [t90, t114] }, Ev8: { target: S.G18.L3, arm: [t114, t138] } } }, L3: { on: { Ev7: { target: S.G18.L4, arm: [t90, t114] }, Ev8: { target: S.G18.L4, arm: [t114, t138] }, Ev9: { target: S.G18.L4, arm: [t138, t18] } } }, L4: { on: { Ev8: { target: S.G18.L0, arm: [t114, t138] }, Ev9: { target: S.G18.L0, arm: [t138, t18] }, Ev10: { target: S.G18.L0, arm: [t18, t42] } } } } },
G19: { default: S.G19.L0, schedules: { t19, t43, t67, t91, t115, t139 }, on: { Ev0: { target: "self", arm: [t19, t43], disarm: [t67, t91] }, Ev1: { target: "self", arm: [t43, t67], disarm: [t91, t115] }, Ev2: { target: "self", arm: [t67, t91], disarm: [t115, t139] }, Ev3: { target: "self", arm: [t91, t115], disarm: [t139, t19] } }, states: { L0: { on: { Ev4: { target: S.G19.L1, arm: [t19, t43] }, Ev5: { target: S.G19.L1, arm: [t43, t67] }, Ev6: { target: S.G19.L1, arm: [t67, t91] } } }, L1: { on: { Ev5: { target: S.G19.L2, arm: [t43, t67] }, Ev6: { target: S.G19.L2, arm: [t67, t91] }, Ev7: { target: S.G19.L2, arm: [t91, t115] } } }, L2: { on: { Ev6: { target: S.G19.L3, arm: [t67, t91] }, Ev7: { target: S.G19.L3, arm: [t91, t115] }, Ev8: { target: S.G19.L3, arm: [t115, t139] } } }, L3: { on: { Ev7: { target: S.G19.L4, arm: [t91, t115] }, Ev8: { target: S.G19.L4, arm: [t115, t139] }, Ev9: { target: S.G19.L4, arm: [t139, t19] } } }, L4: { on: { Ev8: { target: S.G19.L0, arm: [t115, t139] }, Ev9: { target: S.G19.L0, arm: [t139, t19] }, Ev10: { target: S.G19.L0, arm: [t19, t43] } } } } },
G20: { default: S.G20.L0, schedules: { t20, t44, t68, t92, t116, t140 }, on: { Ev0: { target: "self", arm: [t20, t44], disarm: [t68, t92] }, Ev1: { target: "self", arm: [t44, t68], disarm: [t92, t116] }, Ev2: { target: "self", arm: [t68, t92], disarm: [t116, t140] }, Ev3: { target: "self", arm: [t92, t116], disarm: [t140, t20] } }, states: { L0: { on: { Ev4: { target: S.G20.L1, arm: [t20, t44] }, Ev5: { target: S.G20.L1, arm: [t44, t68] }, Ev6: { target: S.G20.L1, arm: [t68, t92] } } }, L1: { on: { Ev5: { target: S.G20.L2, arm: [t44, t68] }, Ev6: { target: S.G20.L2, arm: [t68, t92] }, Ev7: { target: S.G20.L2, arm: [t92, t116] } } }, L2: { on: { Ev6: { target: S.G20.L3, arm: [t68, t92] }, Ev7: { target: S.G20.L3, arm: [t92, t116] }, Ev8: { target: S.G20.L3, arm: [t116, t140] } } }, L3: { on: { Ev7: { target: S.G20.L4, arm: [t92, t116] }, Ev8: { target: S.G20.L4, arm: [t116, t140] }, Ev9: { target: S.G20.L4, arm: [t140, t20] } } }, L4: { on: { Ev8: { target: S.G20.L0, arm: [t116, t140] }, Ev9: { target: S.G20.L0, arm: [t140, t20] }, Ev10: { target: S.G20.L0, arm: [t20, t44] } } } } },
G21: { default: S.G21.L0, schedules: { t21, t45, t69, t93, t117, t141 }, on: { Ev0: { target: "self", arm: [t21, t45], disarm: [t69, t93] }, Ev1: { target: "self", arm: [t45, t69], disarm: [t93, t117] }, Ev2: { target: "self", arm: [t69, t93], disarm: [t117, t141] }, Ev3: { target: "self", arm: [t93, t117], disarm: [t141, t21] } }, states: { L0: { on: { Ev4: { target: S.G21.L1, arm: [t21, t45] }, Ev5: { target: S.G21.L1, arm: [t45, t69] }, Ev6: { target: S.G21.L1, arm: [t69, t93] } } }, L1: { on: { Ev5: { target: S.G21.L2, arm: [t45, t69] }, Ev6: { target: S.G21.L2, arm: [t69, t93] }, Ev7: { target: S.G21.L2, arm: [t93, t117] } } }, L2: { on: { Ev6: { target: S.G21.L3, arm: [t69, t93] }, Ev7: { target: S.G21.L3, arm: [t93, t117] }, Ev8: { target: S.G21.L3, arm: [t117, t141] } } }, L3: { on: { Ev7: { target: S.G21.L4, arm: [t93, t117] }, Ev8: { target: S.G21.L4, arm: [t117, t141] }, Ev9: { target: S.G21.L4, arm: [t141, t21] } } }, L4: { on: { Ev8: { target: S.G21.L0, arm: [t117, t141] }, Ev9: { target: S.G21.L0, arm: [t141, t21] }, Ev10: { target: S.G21.L0, arm: [t21, t45] } } } } },
G22: { default: S.G22.L0, schedules: { t22, t46, t70, t94, t118, t142 }, on: { Ev0: { target: "self", arm: [t22, t46], disarm: [t70, t94] }, Ev1: { target: "self", arm: [t46, t70], disarm: [t94, t118] }, Ev2: { target: "self", arm: [t70, t94], disarm: [t118, t142] }, Ev3: { target: "self", arm: [t94, t118], disarm: [t142, t22] } }, states: { L0: { on: { Ev4: { target: S.G22.L1, arm: [t22, t46] }, Ev5: { target: S.G22.L1, arm: [t46, t70] }, Ev6: { target: S.G22.L1, arm: [t70, t94] } } }, L1: { on: { Ev5: { target: S.G22.L2, arm: [t46, t70] }, Ev6: { target: S.G22.L2, arm: [t70, t94] }, Ev7: { target: S.G22.L2, arm: [t94, t118] } } }, L2: { on: { Ev6: { target: S.G22.L3, arm: [t70, t94] }, Ev7: { target: S.G22.L3, arm: [t94, t118] }, Ev8: { target: S.G22.L3, arm: [t118, t142] } } }, L3: { on: { Ev7: { target: S.G22.L4, arm: [t94, t118] }, Ev8: { target: S.G22.L4, arm: [t118, t142] }, Ev9: { target: S.G22.L4, arm: [t142, t22] } } }, L4: { on: { Ev8: { target: S.G22.L0, arm: [t118, t142] }, Ev9: { target: S.G22.L0, arm: [t142, t22] }, Ev10: { target: S.G22.L0, arm: [t22, t46] } } } } },
G23: { default: S.G23.L0, schedules: { t23, t47, t71, t95, t119, t143 }, on: { Ev0: { target: "self", arm: [t23, t47], disarm: [t71, t95] }, Ev1: { target: "self", arm: [t47, t71], disarm: [t95, t119] }, Ev2: { target: "self", arm: [t71, t95], disarm: [t119, t143] }, Ev3: { target: "self", arm: [t95, t119], disarm: [t143, t23] } }, states: { L0: { on: { Ev4: { target: S.G23.L1, arm: [t23, t47] }, Ev5: { target: S.G23.L1, arm: [t47, t71] }, Ev6: { target: S.G23.L1, arm: [t71, t95] } } }, L1: { on: { Ev5: { target: S.G23.L2, arm: [t47, t71] }, Ev6: { target: S.G23.L2, arm: [t71, t95] }, Ev7: { target: S.G23.L2, arm: [t95, t119] } } }, L2: { on: { Ev6: { target: S.G23.L3, arm: [t71, t95] }, Ev7: { target: S.G23.L3, arm: [t95, t119] }, Ev8: { target: S.G23.L3, arm: [t119, t143] } } }, L3: { on: { Ev7: { target: S.G23.L4, arm: [t95, t119] }, Ev8: { target: S.G23.L4, arm: [t119, t143] }, Ev9: { target: S.G23.L4, arm: [t143, t23] } } }, L4: { on: { Ev8: { target: S.G23.L0, arm: [t119, t143] }, Ev9: { target: S.G23.L0, arm: [t143, t23] }, Ev10: { target: S.G23.L0, arm: [t23, t47] } } } } },
} }));
export const v = m.snapshot.schedules.t0;
