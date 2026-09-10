import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  HardHat,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Clock3,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "./api";
import { Brand } from "./components";
import type { User } from "./types";

export default function Auth({
  needsSetup,
  onLogin,
}: {
  needsSetup: boolean;
  onLogin: (user: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "pending">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const signup = needsSetup || mode === "signup";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError("");
    if (signup && form.get("password") !== form.get("confirm")) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const data = await api<{ user: User }>(
        `/auth/${needsSetup ? "setup" : signup ? "signup" : "login"}`,
        {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            withExamples: form.get("withExamples") === "on",
          }),
        },
      );
      if (signup && !needsSetup) setMode("pending");
      else onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="auth-eyebrow">
            <span /> DU PREMIER JOUR À LA LIVRAISON
          </span>
          <h1>
            Vos chantiers avancent.
            <br />
            <em>Gardez le cap.</em>
          </h1>
          <p>
            Tous vos projets, vos équipes et vos documents réunis dans un espace
            de travail clair.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="auth-building one" />
            <div className="auth-building two" />
            <div className="auth-building three" />
            <div className="auth-art-card">
              <span className="stat-icon teal">
                <HardHat size={22} />
              </span>
              <div>
                <strong>Chaque étape, maîtrisée.</strong>
                <span>Une vision claire de vos travaux</span>
              </div>
              <CheckCheck size={22} />
            </div>
          </div>
          <div className="auth-benefits">
            <span>
              <Check size={17} /> Avancement en temps réel
            </span>
            <span>
              <Check size={17} /> Historique partagé
            </span>
            <span>
              <Check size={17} /> Accès sécurisé
            </span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>Pensé pour le terrain. Conçu pour votre équipe.</span>
          <span>© {new Date().getFullYear()} Suivi</span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-card">
          {mode === "pending" ? (
            <div className="pending-card">
              <span className="pending-icon">
                <Clock3 size={34} />
              </span>
              <h1>Demande envoyée</h1>
              <p>
                Votre compte est en attente de validation par un administrateur.
                Vous pourrez vous connecter dès qu’il aura autorisé votre accès.
              </p>
              <p className="field-help">
                Contactez votre administrateur pour connaître l’état de votre
                demande.
              </p>
              <button
                className="button primary"
                onClick={() => setMode("login")}
              >
                Revenir à la connexion <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <>
              <span className="eyebrow">VOTRE ESPACE DE SUIVI</span>
              <h1 className="auth-title">
                {needsSetup
                  ? "Bienvenue chez vous."
                  : signup
                    ? "Rejoignez votre équipe."
                    : "Heureux de vous revoir."}
              </h1>
              <p className="auth-subtitle">
                {needsSetup
                  ? "Créez le premier compte administrateur pour ouvrir votre espace."
                  : signup
                    ? "Créez votre compte. Un administrateur validera ensuite votre accès."
                    : "Connectez-vous pour retrouver vos projets et faire avancer les choses."}
              </p>
              {!needsSetup && (
                <div className="auth-tabs">
                  <button
                    className={mode === "login" ? "active" : ""}
                    onClick={() => {
                      setMode("login");
                      setError("");
                    }}
                  >
                    Connexion
                  </button>
                  <button
                    className={mode === "signup" ? "active" : ""}
                    onClick={() => {
                      setMode("signup");
                      setError("");
                    }}
                  >
                    Inscription
                  </button>
                </div>
              )}
              <form
                onSubmit={submit}
                className="auth-form"
                key={String(signup)}
              >
                {signup && (
                  <label className="field">
                    Nom complet
                    <input
                      className="input"
                      name="name"
                      placeholder="Votre nom et prénom"
                      required
                      maxLength={100}
                      autoComplete="name"
                    />
                  </label>
                )}
                <label className="field">
                  Adresse e-mail
                  <div className="input-icon">
                    <Mail size={18} />
                    <input
                      className="input"
                      type="email"
                      name="email"
                      placeholder="vous@entreprise.ma"
                      required
                      autoComplete="email"
                      maxLength={254}
                    />
                  </div>
                </label>
                <label className="field">
                  Mot de passe
                  <div className="input-icon">
                    <LockKeyhole size={18} />
                    <input
                      className="input"
                      name="password"
                      type={show ? "text" : "password"}
                      required
                      minLength={signup ? 10 : 1}
                      maxLength={128}
                      placeholder={
                        signup ? "10 caractères minimum" : "Votre mot de passe"
                      }
                      autoComplete={
                        signup ? "new-password" : "current-password"
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={
                        show
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                {signup && (
                  <label className="field">
                    Confirmer le mot de passe
                    <input
                      className="input"
                      name="confirm"
                      type={show ? "text" : "password"}
                      required
                      minLength={10}
                      maxLength={128}
                      autoComplete="new-password"
                      placeholder="Saisissez à nouveau votre mot de passe"
                    />
                  </label>
                )}
                {needsSetup && (
                  <label className="checkbox-field">
                    <input type="checkbox" name="withExamples" />
                    <span>
                      Ajouter des projets fictifs pour découvrir l’application
                    </span>
                  </label>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="button primary auth-submit" disabled={busy}>
                  {busy
                    ? "Veuillez patienter…"
                    : needsSetup
                      ? "Créer mon espace"
                      : signup
                        ? "Demander un accès"
                        : "Se connecter"}
                  {!busy && <ArrowRight size={18} />}
                </button>
              </form>
              <div className="security-note">
                <ShieldCheck size={18} />
                <span>
                  {needsSetup
                    ? "Ce compte pourra gérer les accès et les administrateurs."
                    : "Votre espace est protégé. Les inscriptions sont validées par un administrateur."}
                </span>
              </div>
            </>
          )}
          <p className="auth-footer">
            Du bureau au chantier, sur tous vos appareils.
          </p>
        </div>
      </main>
    </div>
  );
}
