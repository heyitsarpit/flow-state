import { Story } from "../../../src/host/testing/index.ts";
import {
  ChequeDeposit,
  depositSetup,
  Deposits,
  DepositsFake,
  rentCheque,
} from "../machines/deposit.ts";

const depositStory = (id: string) =>
  Story.app(depositSetup, { id, fixtures: [DepositsFake] }).ensure(rentCheque);

/**
 * A cheque deposited in three parts: after the first part the deposit shows a third done.
 */
export const depositInParts = depositStory("transfers/deposit-in-parts")
  .world(Deposits.part.hold(), Deposits.part.hold())
  .send(rentCheque, ChequeDeposit.E.Send({ parts: 3 }))
  .world(Deposits.part.release())
  .checkpoint("one part")
  .world(Deposits.part.release())
  .checkpoint("deposited");

/**
 * The deposit's screen is closed after the first part, then opened again: the write belongs to the
 * Runtime, so its parts go on and the screen opened again shows how far it got, then the deposit.
 */
export const depositClosedMidway = depositStory("transfers/deposit-closed-midway")
  .world(Deposits.part.hold(), Deposits.part.hold())
  .send(rentCheque, ChequeDeposit.E.Send({ parts: 3 }))
  .world(Deposits.part.release())
  .dispose(rentCheque)
  .ensure(rentCheque)
  .checkpoint("reopened")
  .world(Deposits.part.release())
  .checkpoint("deposited");

/**
 * The app reloads while the second part is on the wire: the deposit is unsure, its row shows no
 * progress (progress is never saved), and resuming sends the same deposit again.
 */
export const depositReloaded = depositStory("transfers/deposit-reloaded")
  .world(Deposits.part.hold(), Deposits.part.hold())
  .send(rentCheque, ChequeDeposit.E.Send({ parts: 3 }))
  .world(Deposits.part.release())
  .reload()
  .checkpoint("reloaded")
  .send(rentCheque, ChequeDeposit.E.Resume())
  .checkpoint("resumed");

/**
 * The second part's answer is lost: the deposit is unsure, its row still shows the third it sent.
 */
export const depositPartLost = depositStory("transfers/deposit-part-lost")
  .world(Deposits.part.hold(), Deposits.part.hold())
  .send(rentCheque, ChequeDeposit.E.Send({ parts: 3 }))
  .world(Deposits.part.release(), Deposits.part.lose())
  .checkpoint("lost");

/**
 * The customer aborts while the second part is on the wire, then resumes: the same deposit is sent
 * again with its id, and it lands.
 */
export const depositAbortResume = depositStory("transfers/deposit-abort-resume")
  .world(Deposits.part.hold(), Deposits.part.hold())
  .send(rentCheque, ChequeDeposit.E.Send({ parts: 3 }))
  .world(Deposits.part.release())
  .send(rentCheque, ChequeDeposit.E.Abort())
  .checkpoint("aborted")
  .send(rentCheque, ChequeDeposit.E.Resume())
  .checkpoint("resumed");
