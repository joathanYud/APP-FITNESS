import { Search, UserPlus } from "lucide-react";
import { roleLabel } from "../config";
import type { User } from "../types";

type UserGridProps = {
  users: User[];
  action: (id: string) => void;
  compact?: boolean;
};

export function UserGrid({ users, action, compact = false }: UserGridProps) {
  return (
    <section className={compact ? "panel user-grid compact" : "user-grid"}>
      {!compact && (
        <div className="section-title">
          <Search size={18} />
          <h2>Comunidade</h2>
        </div>
      )}
      {users.map((user) => (
        <article className="user-card" key={user.id}>
          <img src={user.avatarUrl} alt="" />
          <div>
            <b>{user.name}</b>
            <span>
              {roleLabel(user.role)} - {user.goal}
            </span>
            <p>{user.bio}</p>
          </div>
          <button onClick={() => action(user.id)}>
            <UserPlus size={17} /> {user.isFollowing ? "Seguindo" : compact ? "Abrir" : "Seguir"}
          </button>
        </article>
      ))}
    </section>
  );
}
