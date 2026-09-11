import { useState } from "react";
import {
  Check,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Avatar, Empty, Modal } from "./components";
import type { User } from "./types";
import { ACCOUNT_STATUS, dateLabel, ROLES } from "./utils";

export default function Team({
  users,
  currentUser,
  onUpdate,
  onDelete,
}: {
  users: User[];
  currentUser: User;
  onUpdate: (id: string, data: Partial<User>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{
    user: User;
    data: Partial<User>;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const pending = users.filter((u) => u.status === "pending");
  const visible = users.filter(
    (u) =>
      (tab === "all" || u.status === tab) &&
      `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function update() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await onUpdate(confirm.user.id, confirm.data);
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(deleting.id);
      setDeleting(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRAVAILLER ENSEMBLE, EN CONFIANCE</div>
          <h1>Équipe & accès</h1>
          <p>Validez les inscriptions et gérez les comptes utilisateurs.</p>
        </div>
        <span className="date-chip">
          <ShieldCheck size={17} /> Accès contrôlés
        </span>
      </div>
      <div className="stats-grid team-stats">
        <div className="stat-card">
          <span className="stat-icon teal">
            <Users size={22} />
          </span>
          <span className="stat-label">Membres de l’équipe</span>
          <strong className="stat-value">{users.length}</strong>
          <span className="stat-detail">Tous les comptes</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber">
            <UserCheck size={22} />
          </span>
          <span className="stat-label">Demandes en attente</span>
          <strong className="stat-value">{pending.length}</strong>
          <span className="stat-detail">À valider avant la connexion</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue">
            <ShieldCheck size={22} />
          </span>
          <span className="stat-label">Comptes actifs</span>
          <strong className="stat-value">
            {users.filter((u) => u.status === "active").length}
          </strong>
          <span className="stat-detail">Autorisés à se connecter</span>
        </div>
      </div>
      <div className="panel">
        <div className="filter-tabs">
          {[
            ["all", "Tous les membres"],
            ["pending", `Demandes en attente (${pending.length})`],
            ["active", "Actifs"],
            ["suspended", "Suspendus"],
            ["rejected", "Refusés"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`filter-tab ${tab === value ? "active" : ""}`}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher un membre"
              placeholder="Rechercher par nom ou e-mail…"
            />
          </label>
        </div>
        {visible.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>Rôle</th>
                  <th>État</th>
                  <th>Inscription</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const canManage = u.id !== currentUser.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="user-table-name">
                          <Avatar name={u.name} />
                          <div>
                            <strong>
                              {u.name}
                              {u.id === currentUser.id && (
                                <small> (vous)</small>
                              )}
                            </strong>
                            <span>{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {u.id !== currentUser.id ? (
                          <select
                            className="filter-select"
                            value={u.role}
                            aria-label={`Rôle de ${u.name}`}
                            onChange={(e) => {
                              setError("");
                              setConfirm({
                                user: u,
                                data: { role: e.target.value as User["role"] },
                                title: "Modifier le rôle de ce membre ?",
                              });
                            }}
                          >
                            {Object.entries(ROLES).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="role-label">{ROLES[u.role]}</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${u.status}`}>
                          <span />
                          {ACCOUNT_STATUS[u.status]}
                        </span>
                      </td>
                      <td>{dateLabel(u.createdAt)}</td>
                      <td>
                        <div className="user-actions">
                          {canManage &&
                            (u.status === "pending" ? (
                              <>
                                <button
                                  className="button primary small"
                                  onClick={() => {
                                    setError("");
                                    setConfirm({
                                      user: u,
                                      data: { status: "active" },
                                      title: "Autoriser ce nouveau compte ?",
                                    });
                                  }}
                                >
                                  <Check size={15} /> Autoriser
                                </button>
                                <button
                                  className="button secondary small"
                                  onClick={() => {
                                    setError("");
                                    setConfirm({
                                      user: u,
                                      data: { status: "rejected" },
                                      title: "Refuser cette demande ?",
                                    });
                                  }}
                                >
                                  <X size={15} /> Refuser
                                </button>
                              </>
                            ) : (
                              <button
                                className={`button small ${u.status === "active" ? "secondary" : "primary"}`}
                                onClick={() => {
                                  setError("");
                                  setConfirm({
                                    user: u,
                                    data: {
                                      status:
                                        u.status === "active"
                                          ? "suspended"
                                          : "active",
                                    },
                                    title:
                                      u.status === "active"
                                        ? "Suspendre cet accès ?"
                                        : "Réactiver cet accès ?",
                                  });
                                }}
                              >
                                {u.status === "active"
                                  ? "Suspendre"
                                  : "Activer"}
                              </button>
                            ))}
                          {canManage && (
                            <button
                              className="icon-button delete-button"
                              disabled={busy}
                              aria-label={`Supprimer ${u.name}`}
                              onClick={() => {
                                setError("");
                                setDeleting(u);
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Aucun membre à afficher">
            Les comptes correspondant à votre recherche apparaîtront ici.
          </Empty>
        )}
      </div>
      <div className="security-note">
        <ShieldCheck size={19} />
        <span>
          Tous les comptes actifs disposent des mêmes droits dans
          l’application. Les rôles restent visibles comme information de compte.
        </span>
      </div>
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="modal-body">
            <div className="user-chip">
              <Avatar name={confirm.user.name} />
              <div className="user-info">
                <strong>{confirm.user.name}</strong>
                <span>{confirm.user.email}</span>
              </div>
            </div>
            <p>
              Le compte passera à{" "}
              <strong>
                {confirm.data.role
                  ? ROLES[confirm.data.role]
                  : ACCOUNT_STATUS[confirm.data.status!]}
              </strong>
              . Cette modification sera enregistrée avec votre nom dans
              l’historique.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setConfirm(null)}
            >
              Annuler
            </button>
            <button className="button primary" disabled={busy} onClick={update}>
              {busy ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Supprimer ce compte ?"
          onClose={() => setDeleting(null)}
        >
          <div className="modal-body">
            <div className="user-chip">
              <Avatar name={deleting.name} />
              <div className="user-info">
                <strong>{deleting.name}</strong>
                <span>{deleting.email}</span>
              </div>
            </div>
            <p>
              Ce compte sera supprimé et ses sessions seront fermées. Les
              projets et l’historique déjà enregistrés seront conservés.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Annuler
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={deleteAccount}
            >
              {busy ? "Suppression…" : "Supprimer"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
