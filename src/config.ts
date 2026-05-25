import {
  Apple,
  Bot,
  CalendarDays,
  Dumbbell,
  MessageCircle,
  Settings,
  Users,
} from "lucide-react";
import type { Role } from "./types";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export const NAV_ITEMS = [
  ["feed", "Feed", Dumbbell],
  ["people", "Pessoas", Users],
  ["chat", "Chat", MessageCircle],
  ["ai", "IA", Bot],
  ["pros", "Profissionais", Apple],
  ["agenda", "Agenda", CalendarDays],
  ["settings", "Conta", Settings],
] as const;

export type TabId = (typeof NAV_ITEMS)[number][0];

export function roleLabel(role: Role) {
  return {
    MEMBER: "Aluno",
    PERSONAL: "Personal",
    NUTRITIONIST: "Nutricionista",
    ADMIN: "Admin",
  }[role];
}
