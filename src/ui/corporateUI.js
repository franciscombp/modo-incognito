/**
 * Corporate UI — Character Selection & Dashboard
 * Manages the Microsoft-style interface wrapper around the game
 */

import { characterShot } from "./charshot.js";

let selectedCharacterId = null;

export function initCorporateUI() {
  const loginScreen = document.getElementById("login-screen");
  const corporateWrapper = document.getElementById("corporate-wrapper");
  const characterGrid = document.getElementById("character-grid");
  const loginBtn = document.getElementById("login-btn");
  const profileName = document.getElementById("profile-name");
  const profileAvatar = document.getElementById("profile-avatar");
  const topbarTitle = document.getElementById("topbar-title");
  const sidebarItems = document.querySelectorAll(".sidebar-item");

  // Load and display characters
  async function loadCharacters(data) {
    const characters = data.looks?.characters || {};
    const characterIds = Object.keys(characters).filter(id => id !== "generic");

    // Clear grid
    characterGrid.innerHTML = "";

    // Add character cards
    for (const id of characterIds) {
      const recipe = characters[id];
      const card = document.createElement("div");
      card.className = "character-card";
      card.setAttribute("data-character", id);

      const image = document.createElement("div");
      image.className = "character-card-image";

      const name = document.createElement("div");
      name.className = "character-card-name";
      name.textContent = recipe.name || id.charAt(0).toUpperCase() + id.slice(1);

      card.appendChild(image);
      card.appendChild(name);
      characterGrid.appendChild(card);

      // Load character shot
      const shot = characterShot(recipe);
      if (shot) {
        image.style.backgroundImage = `url(${shot})`;
      } else {
        image.style.background = `hsl(var(--accent-main) / 0.1)`;
        image.style.display = "flex";
        image.style.alignItems = "center";
        image.style.justifyContent = "center";
        image.textContent = recipe.name || id;
      }

      // Handle selection
      card.addEventListener("click", () => selectCharacter(id, recipe.name || id));
    }
  }

  function selectCharacter(id, name) {
    selectedCharacterId = id;

    // Update UI
    document.querySelectorAll(".character-card").forEach(c => c.classList.remove("selected"));
    document.querySelector(`[data-character="${id}"]`)?.classList.add("selected");
    loginBtn.disabled = false;
  }

  // Handle character selection and transition to dashboard
  function handleLogin(e) {
    e.preventDefault();

    if (!selectedCharacterId) {
      alert("Por favor selecciona un personaje");
      return;
    }

    // Smooth transition to dashboard
    loginScreen.style.opacity = "0";
    loginScreen.style.transition = "opacity 0.5s ease-out";

    setTimeout(() => {
      loginScreen.style.display = "none";
      corporateWrapper.classList.remove("hidden");

      // Update profile with character name
      const characterName = document.querySelector(`[data-character="${selectedCharacterId}"] .character-card-name`)?.textContent || "Jugador";
      profileName.textContent = characterName;
      topbarTitle.textContent = characterName;

      // Set avatar initials
      const initials = characterName
        .split(" ")
        .map(w => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      profileAvatar.textContent = initials;

      // Store selected character
      sessionStorage.setItem("selectedCharacter", selectedCharacterId);
      window.__selectedCharacter = selectedCharacterId;
    }, 300);
  }

  // Sidebar navigation
  function handleSidebarClick(e) {
    const item = e.target.closest(".sidebar-item");
    if (!item) return;

    const menuType = item.getAttribute("data-menu");
    if (!menuType) return; // Skip external links

    e.preventDefault();

    // Update active state
    sidebarItems.forEach(el => el.classList.remove("active"));
    item.classList.add("active");

    // Handle menu actions
    switch (menuType) {
      case "game":
        // Keep game visible (default state)
        document.getElementById("corporate-main")?.focus();
        break;
      case "stats":
        alert("Estadísticas del jugador - Próximamente");
        break;
      case "achievements":
        alert("Tus logros y desbloqueos - Próximamente");
        break;
      case "settings":
        alert("Configuración de juego - Próximamente");
        break;
      case "help":
        alert("Centro de ayuda y tutoriales - Próximamente");
        break;
    }
  }

  // Profile menu click
  function handleProfileClick() {
    alert("Perfil y ajustes de cuenta - Próximamente");
  }

  // Event listeners
  loginBtn.addEventListener("click", handleLogin);
  document.querySelectorAll(".sidebar-item[data-menu]").forEach(item => {
    item.addEventListener("click", handleSidebarClick);
  });
  document.getElementById("profile-menu").addEventListener("click", handleProfileClick);

  return {
    loadCharacters,
    showGame: () => {
      sidebarItems.forEach(el => el.classList.remove("active"));
      document.querySelector(".sidebar-item[data-menu='game']")?.classList.add("active");
    }
  };
}
