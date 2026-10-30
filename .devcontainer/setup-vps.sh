#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  Initializing Aurox Cloud Linux VPS...   "
echo "=========================================="

export DEBIAN_FRONTEND=noninteractive

sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
  firefox-esr \
  python3 \
  python3-pip \
  python3-venv \
  nodejs \
  npm \
  tmux \
  jq \
  htop \
  curl \
  wget

sudo rm -rf /var/lib/apt/lists/*

# Configure clean right-click Fluxbox Desktop Menu with Firefox, Terminal & File Manager
mkdir -p "$HOME/.fluxbox"
cat << 'EOF' > "$HOME/.fluxbox/menu"
[begin] (  Aurox Cloud VPS  )
    [exec] (Web Browser - Firefox) { firefox-esr --no-remote } <>
    [exec] (Terminal) { tilix -w ~ -e bash -il } <>
    [exec] (File Manager) { nautilus ~ } <>
    [exec] (Text Editor) { mousepad } <>
    [nop] (------------------) {}
    [submenu] (System Tools) {}
        [exec] (Task Manager - htop) { tilix -t "System Monitor" -e htop } <>
        [exec] (Disk Usage - ncdu) { tilix -t "Disk Usage" -e ncdu / } <>
        [exec] (Set 1080p Resolution) { bash /usr/local/bin/set-resolution 1920x1080 } <>
    [end]
    [config] (Desktop Settings)
    [workspaces] (Workspaces)
[end]
EOF

# Add convenient terminal status banner
if ! grep -q "AUROX_VPS_BANNER" "$HOME/.bashrc" 2>/dev/null; then
  cat << 'EOF' >> "$HOME/.bashrc"

# AUROX_VPS_BANNER
echo -e "\033[1;33m⚡ Aurox Cloud VPS Online\033[0m | OS: $(. /etc/os-release && echo "$PRETTY_NAME") | CPU: $(nproc) Cores | RAM: $(free -h | awk '/^Mem:/ {print $2}')"
echo -e "🖥️  Open the \033[1;36mPORTS\033[0m tab and launch port \033[1;32m6080\033[0m in your browser for the full Linux Desktop (Password: \033[1;33maurox123\033[0m)"
EOF
fi

echo "✓ Aurox Cloud VPS setup complete!"
