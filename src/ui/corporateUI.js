/**
 * Corporate UI — Login & Dashboard Interface
 * Manages the Microsoft-style interface wrapper around the game
 */

export function initCorporateUI() {
  const loginScreen = document.getElementById("login-screen");
  const corporateWrapper = document.getElementById("corporate-wrapper");
  const loginBtn = document.getElementById("login-btn");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const profileName = document.getElementById("profile-name");
  const profileAvatar = document.getElementById("profile-avatar");
  const sidebarItems = document.querySelectorAll(".sidebar-item");

  // Extract name from email for display
  function extractName(email) {
    const name = email.split("@")[0].split(".").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return name || "Jugador";
  }

  // Update profile display
  function updateProfile(email) {
    const name = extractName(email);
    profileName.textContent = name;
    // Set avatar initials
    const initials = name
      .split(" ")
      .map(w => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    profileAvatar.textContent = initials;
  }

  // Handle login
  function handleLogin(e) {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      alert("Por favor completa todos los campos");
      return;
    }

    // Smooth transition to dashboard
    loginScreen.style.opacity = "0";
    loginScreen.style.transition = "opacity 0.5s ease-out";

    setTimeout(() => {
      loginScreen.style.display = "none";
      corporateWrapper.classList.remove("hidden");
      updateProfile(email);
      // Store in sessionStorage for sidebar menu
      sessionStorage.setItem("playerEmail", email);
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
  emailInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin(e);
  });
  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin(e);
  });

  document.querySelectorAll(".sidebar-item[data-menu]").forEach(item => {
    item.addEventListener("click", handleSidebarClick);
  });

  document.getElementById("profile-menu").addEventListener("click", handleProfileClick);

  // Initialize with stored email if exists
  const storedEmail = sessionStorage.getItem("playerEmail");
  if (storedEmail) {
    emailInput.value = storedEmail;
    updateProfile(storedEmail);
  }

  return {
    showGame: () => {
      sidebarItems.forEach(el => el.classList.remove("active"));
      document.querySelector(".sidebar-item[data-menu='game']")?.classList.add("active");
    }
  };
}
