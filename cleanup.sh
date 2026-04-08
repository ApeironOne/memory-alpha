#!/bin/bash
set -e

# Memory Alpha Cleanup Script
# Removes plugin components with granular control

BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}Memory Alpha Cleanup${NC}"
echo "================================"
echo ""

# Find config to locate SQLite path
CONFIG_FILE="$HOME/.openclaw/plugins/memory-alpha/config.json"
SQLITE_PATH=""
if [ -f "$CONFIG_FILE" ]; then
  SQLITE_PATH=$(grep -o '"sqlitePath":\s*"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
fi

# Options
echo "What would you like to remove?"
echo ""
echo "1) Uninstall plugin from OpenClaw"
echo "2) Stop & remove Docker compose stack"
echo "3) Delete SQLite database"
echo "4) Delete plugin config file"
echo "5) All of the above (full cleanup)"
echo "6) Cancel"
echo ""
read -p "Choose (1-6): " choice

case $choice in
  1)
    echo -e "\n${YELLOW}Uninstalling plugin from OpenClaw...${NC}"
    if openclaw plugins list 2>/dev/null | grep -q "memory-alpha"; then
      openclaw plugins uninstall memory-alpha --force
      echo -e "${GREEN}✓ Plugin uninstalled${NC}"
      echo -e "${YELLOW}Restart gateway: openclaw gateway restart${NC}"
    else
      echo -e "${YELLOW}Plugin not installed${NC}"
    fi
    ;;
    
  2)
    echo -e "\n${YELLOW}Stopping Docker compose stack...${NC}"
    if [ -f "docker-compose.yml" ]; then
      docker compose down -v
      echo -e "${GREEN}✓ Docker stack stopped${NC}"
      
      read -p "Delete Docker data volumes? (y/N): " delete_volumes
      if [ "$delete_volumes" = "y" ]; then
        rm -rf data/
        echo -e "${GREEN}✓ Docker volumes deleted${NC}"
      fi
    else
      echo -e "${YELLOW}No docker-compose.yml found${NC}"
    fi
    ;;
    
  3)
    echo -e "\n${YELLOW}Deleting SQLite database...${NC}"
    if [ -n "$SQLITE_PATH" ] && [ -f "$SQLITE_PATH" ]; then
      echo "Found: $SQLITE_PATH"
      read -p "Delete this database? (y/N): " confirm
      if [ "$confirm" = "y" ]; then
        rm -f "$SQLITE_PATH"
        echo -e "${GREEN}✓ SQLite database deleted${NC}"
      fi
    else
      echo -e "${YELLOW}No SQLite database found${NC}"
    fi
    ;;
    
  4)
    echo -e "\n${YELLOW}Deleting plugin config...${NC}"
    if [ -f "$CONFIG_FILE" ]; then
      rm -f "$CONFIG_FILE"
      rmdir "$HOME/.openclaw/plugins/memory-alpha" 2>/dev/null || true
      echo -e "${GREEN}✓ Config deleted${NC}"
    else
      echo -e "${YELLOW}No config file found${NC}"
    fi
    ;;
    
  5)
    echo -e "\n${YELLOW}Full cleanup - removing everything...${NC}"
    echo ""
    
    # Uninstall plugin
    if openclaw plugins list 2>/dev/null | grep -q "memory-alpha"; then
      echo "→ Uninstalling plugin..."
      openclaw plugins uninstall memory-alpha --force
      echo -e "${GREEN}✓ Plugin uninstalled${NC}"
    fi
    
    # Stop Docker
    if [ -f "docker-compose.yml" ]; then
      echo "→ Stopping Docker stack..."
      docker compose down -v 2>/dev/null || true
      rm -rf data/ 2>/dev/null || true
      echo -e "${GREEN}✓ Docker cleaned${NC}"
    fi
    
    # Delete SQLite
    if [ -n "$SQLITE_PATH" ] && [ -f "$SQLITE_PATH" ]; then
      echo "→ Deleting SQLite database..."
      rm -f "$SQLITE_PATH"
      echo -e "${GREEN}✓ SQLite deleted${NC}"
    fi
    
    # Delete config
    if [ -f "$CONFIG_FILE" ]; then
      echo "→ Deleting config..."
      rm -f "$CONFIG_FILE"
      rmdir "$HOME/.openclaw/plugins/memory-alpha" 2>/dev/null || true
      echo -e "${GREEN}✓ Config deleted${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}Full cleanup complete!${NC}"
    echo -e "${YELLOW}Restart gateway: openclaw gateway restart${NC}"
    ;;
    
  6)
    echo -e "\n${YELLOW}Cancelled${NC}"
    exit 0
    ;;
    
  *)
    echo -e "\n${RED}Invalid choice${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${BOLD}Cleanup complete${NC}"
