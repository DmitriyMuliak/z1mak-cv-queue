#!/bin/bash

# Конфігурація
AGENTS_REPO="https://github.com/lst97/claude-code-sub-agents.git"
TARGET_DIR="$HOME/.claude/agents/lst97"

echo "🚀 Синхронізація Claude Subagents..."

# Створення структури папок
mkdir -p "$TARGET_DIR"

if [ -d "$TARGET_DIR/.git" ]; then
    echo "🔄 Оновлення існуючих агентів..."
    cd "$TARGET_DIR" && git pull origin main
else
    echo "📥 Клонування репозиторію агентів..."
    git clone "$AGENTS_REPO" "$TARGET_DIR"
fi

echo "✅ Агенти готові до роботи."


# Execute

# chmod +x setup-agents.sh
# ./setup-agents.sh

# bash setup-agents.sh

# zsh setup-agents.sh