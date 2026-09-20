#!/usr/bin/env bash
#
# Installe Pécule en service sur Debian ou Ubuntu (conteneur LXC, machine virtuelle,
# ou serveur dédié). Relancer le script plus tard met simplement l'application à jour.
#
#   sudo bash install.sh
#   curl -fsSL https://raw.githubusercontent.com/tristanbasb/pecule/main/install.sh | sudo bash
#
# Réglages possibles, à passer en variables d'environnement :
#   PECULE_DIR=/opt/pecule   dossier d'installation
#   PECULE_PORT=5180         port d'écoute
#   PECULE_USER=pecule       compte système qui fait tourner le service
#   PECULE_DATA_DIR=...      dossier des données (par défaut : <PECULE_DIR>/data)
#   PECULE_REPO=...          dépôt à cloner
#   PECULE_SYSTEMD_DIR=...   dossier des unités systemd (par défaut : /etc/systemd/system)
#
set -euo pipefail

REPO="${PECULE_REPO:-https://github.com/tristanbasb/pecule.git}"
PORT="${PECULE_PORT:-5180}"
SERVICE_USER="${PECULE_USER:-pecule}"
DATA_DIR="${PECULE_DATA_DIR:-}"
SYSTEMD_DIR="${PECULE_SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE=pecule
NODE_MAJOR=22

if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; RESET=''
fi
step() { printf '%s %s\n' "${BOLD}==>${RESET}" "$*"; }
warn() { printf '%s %s\n' "${YELLOW}Attention :${RESET}" "$*" >&2; }
die() { printf '%s %s\n' "${RED}Erreur :${RESET}" "$*" >&2; exit 1; }

# Dossier d'installation : le clone d'où vient le script, sinon /opt/pecule.
script_dir=''
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "${PECULE_DIR:-}" ]; then
  DIR="$PECULE_DIR"
elif [ -n "$script_dir" ] && grep -qs '"name": *"pecule"' "$script_dir/package.json"; then
  DIR="$script_dir"
else
  DIR="/opt/pecule"
fi

[ "$(id -u)" = '0' ] || die "à lancer en root : sudo bash install.sh"
command -v apt-get >/dev/null || die "script prévu pour Debian ou Ubuntu (apt-get introuvable)"
command -v systemctl >/dev/null || die "systemd est nécessaire ; dans un conteneur LXC, le démarrer avec systemd"

step "Paquets de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates >/dev/null

# Vite 8 demande Node ^20.19 ou >= 22.12.
node_ready() {
  command -v node >/dev/null || return 1
  local version major minor rest
  version="$(node -v 2>/dev/null)" || return 1
  version="${version#v}"
  major="${version%%.*}"
  rest="${version#*.}"
  minor="${rest%%.*}"
  case "$major" in
    20) [ "$minor" -ge 19 ] ;;
    22) [ "$minor" -ge 12 ] ;;
    2[3-9] | [3-9][0-9]) true ;;
    *) false ;;
  esac
}

if node_ready; then
  step "Node.js $(node -v) déjà installé"
else
  step "Installation de Node.js ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  node_ready || die "Node.js installé en version $(node -v 2>/dev/null || echo inconnue), trop ancienne"
fi

# Le dossier appartient au compte de service : autoriser git à y travailler en root.
if ! git config --global --get-all safe.directory 2>/dev/null | grep -qx "$DIR"; then
  git config --global --add safe.directory "$DIR"
fi

if [ -d "$DIR/.git" ]; then
  step "Mise à jour du code dans $DIR"
  git -C "$DIR" pull --ff-only --quiet ||
    die "impossible de mettre à jour $DIR (modifications locales ?) ; corriger avec git puis relancer"
elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
  die "$DIR existe déjà sans être un dépôt git ; choisir un autre dossier avec PECULE_DIR"
else
  step "Téléchargement du code dans $DIR"
  git clone --quiet "$REPO" "$DIR"
fi

step "Dépendances et compilation (quelques minutes la première fois)"
cd "$DIR"
npm ci --no-audit --no-fund >/dev/null
npm run build >/dev/null

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  step "Création du compte système $SERVICE_USER"
  adduser --system --group --no-create-home --home "$DIR" --shell /usr/sbin/nologin "$SERVICE_USER" >/dev/null
fi

data_path="${DATA_DIR:-$DIR/data}"
mkdir -p "$data_path"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$DIR" "$data_path"

step "Service systemd"
mkdir -p "$SYSTEMD_DIR"
{
  cat <<EOF
[Unit]
Description=Pécule — suivi du budget et des investissements
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$DIR
Environment=PECULE_LAN=1
EOF
  if [ -n "$DATA_DIR" ]; then
    printf 'Environment=PECULE_DATA_DIR=%s\n' "$DATA_DIR"
  fi
  cat <<EOF
ExecStart=$DIR/node_modules/.bin/vite preview --host 0.0.0.0 --port $PORT
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$DIR $data_path

[Install]
WantedBy=multi-user.target
EOF
} >"$SYSTEMD_DIR/$SERVICE.service"

systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"

step "Vérification"
started=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
    started=1
    break
  fi
  sleep 1
done

if [ "$started" != '1' ]; then
  warn "le service n'a pas répondu sur le port $PORT"
  systemctl --no-pager --lines=15 status "$SERVICE" || true
  die "consulter les journaux : journalctl -u $SERVICE -n 50 --no-pager"
fi

address="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)"
printf '\n%s Pécule tourne sur %shttp://%s:%s%s\n' "${GREEN}✓${RESET}" "$BOLD" "${address:-<ip-du-serveur>}" "$PORT" "$RESET"
printf '  Données      : %s (sauvegarde quotidienne dans %s/backups)\n' "$data_path" "$data_path"
printf '  Journaux     : journalctl -u %s -f\n' "$SERVICE"
printf '  Mise à jour  : sudo bash %s/install.sh\n' "$DIR"
printf '\n%s l’application n’a pas d’authentification : à réserver à un réseau de confiance.\n' "${YELLOW}Attention :${RESET}"
printf '  L’accès se fait par adresse IP ; un nom de domaine serait refusé par le contrôle d’hôte.\n\n'
