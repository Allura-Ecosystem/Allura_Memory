/**
 * Types for Story 26.6 — Containment Connectors and Response Receipts.
 */

import type { z } from "zod"
import { ContainmentConnector, ContainmentProposal, ContainmentReceipt } from "./schemas"

export type ContainmentConnector = z.infer<typeof ContainmentConnector>
export type ContainmentProposal = z.infer<typeof ContainmentProposal>
export type ContainmentReceipt = z.infer<typeof ContainmentReceipt>
