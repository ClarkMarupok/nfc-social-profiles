// Public browser configuration only. Never put a Supabase secret/service-role key here.
const SUPABASE_URL = "https://jzklvyoyalqanzhgtthl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_IWbsrcYDFAqOwn-JbOwAxQ_g5UPR_zF";
const PHOTO_BUCKET = "profile-photos";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const demoProfile = {
  id: "demo", display_name: "Clark Aga", slug: "clark-aga",
  bio: "Creative mind, coffee enthusiast, and professional playlist curator.",
  avatar_url: null, theme: { card: "#3b2854", text: "#ffffff", accent: "#c8a8ff", background: "#251642" }, published: true,
  socials: [
    { label: "Instagram", url: "https://instagram.com" },
    { label: "TikTok", url: "https://tiktok.com" },
    { label: "Spotify", url: "https://spotify.com" },
    { label: "Say hello", url: "mailto:hello@example.com" },
  ],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const configured = window.supabase && !SUPABASE_URL.includes("YOUR_PROJECT_REF") && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
const client = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
let editingProfile = null;
let currentAdmin = null;
let toastTimer;

function escapeSlug(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55);
}

function publicUrl(slug) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("p", slug);
  return url.toString();
}

function photoUrl(profile) { return profile?.avatar_url || ""; }

function photoObjectPath(avatarUrl) {
  if (!avatarUrl) return null;
  try {
    const marker = "/storage/v1/object/public/" + PHOTO_BUCKET + "/";
    const pathname = new URL(avatarUrl).pathname;
    const index = pathname.indexOf(marker);
    return index < 0 ? null : decodeURIComponent(pathname.slice(index + marker.length));
  } catch { return null; }
}

function normalizeSocialLinks(socials) {
  if (Array.isArray(socials)) return socials;
  if (socials && typeof socials === "object") return Object.entries(socials).map(([label, url]) => ({ label, url }));
  return [];
}

function setAvatar(element, profile) {
  element.style.backgroundImage = "";
  const initials = (profile.display_name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const text = element.querySelector("span");
  const url = photoUrl(profile);
  if (url) {
    element.style.backgroundImage = 'linear-gradient(145deg, #17112822, #17112855), url("' + url + '")';
    if (text) text.textContent = "";
  } else if (text) {
    text.textContent = initials;
  }
}
function renderLinks(target, links, compact = false) {
  target.replaceChildren();
  normalizeSocialLinks(links).forEach((link) => {
    if (!link || typeof link.label !== "string" || typeof link.url !== "string") return;
    let url;
    try { url = new URL(link.url); } catch { return; }
    if (!["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) return;
    const anchor = document.createElement("a");
    anchor.className = "social-pill";
    anchor.href = url.toString();
    const name = link.label.slice(0, 35);
    const key = name.toLowerCase();
    const icons = { instagram: "◎", facebook: "f", tiktok: "♪", messenger: "••", email: "✉", mail: "✉", website: "↗", linkedin: "in", youtube: "▶", spotify: "♫" };
    const icon = document.createElement("span"); icon.className = "social-icon"; icon.textContent = icons[key] || name.slice(0, 1).toUpperCase();
    const label = document.createElement("span"); label.className = "social-label"; label.textContent = name;
    const arrow = document.createElement("span"); arrow.className = "social-arrow"; arrow.textContent = "↗";
    anchor.append(icon, label, arrow);
    if (url.protocol === "https:" || url.protocol === "http:") {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    target.append(anchor);
  });
  if (!compact && !target.childElementCount) target.classList.add("hidden");
  else target.classList.remove("hidden");
}

function renderHero(profile) {
  $("#hero-name").textContent = profile.display_name;
  $("#hero-bio").textContent = profile.bio || "A little bit of me, all in one place.";
  setAvatar($("#hero-avatar"), profile);
  renderLinks($("#hero-links"), profile.socials, true);
}

function showLanding() {
  document.body.classList.remove("profile-mode");
  $("#landing").classList.remove("hidden");
  $("#profile-view").classList.add("hidden");
}

function showProfile(profile, offlinePreview = false) {
  document.body.classList.add("profile-mode");
  $("#landing").classList.add("hidden");
  $("#profile-view").classList.remove("hidden");
  const card = $("#public-card");
  const accent = profile.theme?.accent || "#c8a8ff";
  card.style.setProperty("--profile-color", /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#c8a8ff");
  $("#public-name").textContent = profile.display_name;
  const nickname = String(profile.nickname || "").trim();
  $("#public-nickname").textContent = nickname;
  $("#public-nickname").classList.toggle("hidden", !nickname);
  $("#public-bio").textContent = profile.bio || "A little bit of me, all in one place.";
  setAvatar($("#public-avatar"), profile);
  renderLinks($("#public-links"), profile.socials);
  $("#share-profile").classList.toggle("hidden", offlinePreview);
  $("#share-profile").onclick = async () => {
    const link = publicUrl(profile.slug);
    if (navigator.share) {
      try { await navigator.share({ title: `${profile.display_name} · Halo`, url: link }); } catch (error) { if (error.name !== "AbortError") showToast("Could not open sharing on this device."); }
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      showToast("Profile link copied!");
    } else {
      window.prompt("Copy this profile link:", link);
    }
  };
  $("#profile-status").textContent = "";
}

async function routeToCurrentProfile() {
  const slug = new URLSearchParams(location.search).get("p");
  if (!slug) { showLanding(); return; }
  if (!configured) {
    if (slug === demoProfile.slug) showProfile(demoProfile, true);
    else showNotFound();
    return;
  }
  showProfile({ display_name: "Loading profile…", bio: "", slug, socials: {}, theme: { accent: "#c8a8ff" } });
  const { data, error } = await client.from("profiles").select("display_name,nickname,slug,bio,avatar_url,theme,socials").eq("slug", slug).eq("published", true).maybeSingle();
  if (error || !data) { showNotFound(); return; }
  showProfile(data);
}

function showNotFound() {
  document.body.classList.add("profile-mode");
  $("#landing").classList.add("hidden");
  $("#profile-view").classList.remove("hidden");
  $("#public-name").textContent = "Profile not found";
  $("#public-bio").textContent = "This link may be private, or the profile may have moved.";
  $("#public-avatar").style.backgroundImage = "";
  $("#public-avatar span").textContent = "?";
  $("#public-links").replaceChildren();
  $("#profile-status").textContent = "";
}

function openModal() {
  $("#admin-modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  if (!configured) $("#login-message").textContent = "Add your Supabase URL and publishable key in app.js to enable sign in.";
  else checkSession();
  setTimeout(() => $("#login-form input[name=email]").focus(), 80);
}

function closeModal() {
  $("#admin-modal").classList.add("hidden");
  document.body.style.overflow = "";
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

async function checkSession() {
  if (!configured) return;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return showLogin();
  const { data, error } = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error || !data) {
    await client.auth.signOut();
    showLogin(error ? "Could not verify admin access. Check that the SQL setup is complete." : "This account is not listed as an admin.");
    return;
  }
  currentAdmin = user;
  showDashboard();
  await loadProfiles();
}

function showLogin(message = "") {
  currentAdmin = null;
  $("#login-view").classList.remove("hidden");
  $("#dashboard-view").classList.add("hidden");
  $("#login-message").textContent = message;
}

function showDashboard() {
  $("#login-view").classList.add("hidden");
  $("#dashboard-view").classList.remove("hidden");
}

async function loadProfiles() {
  const list = $("#profile-list");
  list.innerHTML = "<p class='panel-intro'>Loading profiles…</p>";
  const { data, error } = await client.from("profiles").select("id,display_name,slug,avatar_url,published").order("created_at", { ascending: false });
  if (error) { list.innerHTML = ""; $("#dashboard-message").textContent = error.message; return; }
  list.replaceChildren();
  if (!data.length) {
    const empty = document.createElement("p"); empty.className = "panel-intro"; empty.textContent = "Your profile library is ready for its first hello."; list.append(empty); return;
  }
  data.forEach((profile) => {
    const row = document.createElement("div"); row.className = "profile-row";
    const avatar = document.createElement("div"); avatar.className = "profile-row-avatar";
    avatar.textContent = profile.display_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    if (profile.avatar_url) avatar.style.backgroundImage = `url("${photoUrl(profile)}")`, avatar.textContent = "";
    const info = document.createElement("div"); info.className = "profile-row-info";
    const name = document.createElement("b"); name.textContent = profile.display_name;
    const slug = document.createElement("small"); slug.textContent = `?p=${profile.slug}`;
    info.append(name, slug);
    const status = document.createElement("span"); status.className = `profile-row-status${profile.published ? "" : " draft"}`; status.textContent = profile.published ? "LIVE" : "DRAFT";
    const open = document.createElement("button"); open.type = "button"; open.textContent = "View"; open.addEventListener("click", () => window.open(publicUrl(profile.slug), "_blank", "noopener"));
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit"; edit.addEventListener("click", () => editProfile(profile.id));
    row.append(avatar, info, status, open, edit); list.append(row);
  });
}

function resetEditor() {
  editingProfile = null;
  $("#profile-form").reset();
  $("#profile-form").classList.add("hidden");
  $("#profile-form input[name=slug]").disabled = false;
  delete $("#profile-form input[name=slug]").dataset.edited;
  $("#editor-heading").textContent = "New profile";
  $("#delete-profile").classList.add("hidden");
  $("#editor-message").textContent = "";
}

function openNewProfile() {
  resetEditor();
  $("#profile-form").classList.remove("hidden");
  $("#profile-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function editProfile(id) {
  const { data, error } = await client.from("profiles").select("*").eq("id", id).single();
  if (error) { $("#dashboard-message").textContent = error.message; return; }
  editingProfile = data;
  const form = $("#profile-form");
  form.reset();
  form.elements.display_name.value = data.display_name;
  form.elements.nickname.value = data.nickname || "";
  form.elements.slug.value = data.slug;
  form.elements.slug.disabled = true;
  form.elements.bio.value = data.bio || "";
  form.elements.theme_color.value = data.theme?.accent || "#c8a8ff";
  form.elements.social_links.value = normalizeSocialLinks(data.socials).map((item) => `${item.label}, ${item.url}`).join("\n");
  form.elements.is_published.checked = data.published;
  $("#editor-heading").textContent = `Edit ${data.display_name}`;
  $("#delete-profile").classList.remove("hidden");
  $("#editor-message").textContent = "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function parseSocialLinks(value) {
  const result = [];
  for (const [index, line] of value.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const comma = trimmed.indexOf(",");
    if (comma < 1) throw new Error(`Social link line ${index + 1} needs a label, then a comma, then its URL.`);
    const label = trimmed.slice(0, comma).trim();
    const url = trimmed.slice(comma + 1).trim();
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error(`The URL on line ${index + 1} is not valid.`); }
    if (!["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol)) throw new Error(`Use an https, http, mailto, or tel link on line ${index + 1}.`);
    result.push({ label: label.slice(0, 35), url: parsed.toString() });
  }
  return result;
}

async function saveProfile(event) {
  event.preventDefault();
  if (!currentAdmin) return;
  const form = event.currentTarget;
  const message = $("#editor-message");
  message.textContent = "Saving…";
  const formData = new FormData(form);
  const displayName = String(formData.get("display_name") || "").trim();
  const slug = editingProfile?.slug || escapeSlug(String(formData.get("slug") || ""));
  if (!slug || slug.length < 2) { message.textContent = "Use a public slug with at least two letters or numbers."; return; }
  let socialLinks;
  try { socialLinks = parseSocialLinks(String(formData.get("social_links") || "")); }
  catch (error) { message.textContent = error.message; return; }
  const profile = {
    display_name: displayName,
    nickname: String(formData.get("nickname") || "").trim() || null,
    slug,
    bio: String(formData.get("bio") || "").trim(),
    theme: { ...(editingProfile?.theme || { card: "#3b2854", text: "#ffffff", background: "#251642" }), accent: String(formData.get("theme_color") || "#c8a8ff") },
    socials: Object.fromEntries(socialLinks.map((item) => [item.label, item.url])),
    published: form.elements.is_published.checked,
    updated_at: new Date().toISOString(),
  };
  const photo = form.elements.photo.files[0];
  let newPhotoPath = photoObjectPath(editingProfile?.avatar_url);
  if (photo) {
    if (!/^image\/(jpeg|png|webp)$/.test(photo.type)) { message.textContent = "Choose a JPG, PNG, or WebP image."; return; }
    if (photo.size > MAX_PHOTO_BYTES) { message.textContent = "That image is larger than 2 MB. Choose a smaller file."; return; }
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[photo.type];
    newPhotoPath = `${slug}/avatar.${extension}`;
    const { error } = await client.storage.from(PHOTO_BUCKET).upload(newPhotoPath, photo, { upsert: true, contentType: photo.type, cacheControl: "3600" });
    if (error) { message.textContent = `Photo upload failed: ${error.message}`; return; }
  }
  profile.avatar_url = newPhotoPath ? client.storage.from(PHOTO_BUCKET).getPublicUrl(newPhotoPath).data.publicUrl : null;
  const result = editingProfile
    ? await client.from("profiles").update(profile).eq("id", editingProfile.id).select().single()
    : await client.from("profiles").insert(profile).select().single();
  if (result.error) {
    if (newPhotoPath && newPhotoPath !== photoObjectPath(editingProfile?.avatar_url)) await client.storage.from(PHOTO_BUCKET).remove([newPhotoPath]);
    message.textContent = result.error.code === "23505" ? "That public slug is already taken. Choose a different one." : result.error.message;
    return;
  }
  const oldPhotoPath = photoObjectPath(editingProfile?.avatar_url);
  if (oldPhotoPath && oldPhotoPath !== newPhotoPath) {
    const { error: cleanupError } = await client.storage.from(PHOTO_BUCKET).remove([oldPhotoPath]);
    if (cleanupError) console.warn("Profile saved, but its previous image could not be removed:", cleanupError.message);
  }
  showToast("Profile saved.");
  resetEditor();
  await loadProfiles();
  if (new URLSearchParams(location.search).get("p") === slug) await routeToCurrentProfile();
}

async function deleteProfile() {
  if (!editingProfile || !window.confirm(`Delete ${editingProfile.display_name}'s profile? This cannot be undone.`)) return;
  $("#editor-message").textContent = "Deleting…";
  const { error } = await client.from("profiles").delete().eq("id", editingProfile.id);
  if (error) { $("#editor-message").textContent = error.message; return; }
  const photoPath = photoObjectPath(editingProfile.avatar_url);
  if (photoPath) {
    const { error: photoError } = await client.storage.from(PHOTO_BUCKET).remove([photoPath]);
    if (photoError) console.warn("Profile removed, but its image could not be removed:", photoError.message);
  }
  resetEditor();
  await loadProfiles();
  showToast("Profile deleted.");
}

async function signIn(event) {
  event.preventDefault();
  if (!configured) return;
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  $("#login-message").textContent = "Signing in…";
  const { error } = await client.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
  button.disabled = false;
  if (error) { $("#login-message").textContent = error.message; return; }
  form.reset();
  await checkSession();
}

async function signOut() {
  await client.auth.signOut();
  resetEditor();
  showLogin("You’re signed out.");
}

function initialize() {
  $("#year").textContent = new Date().getFullYear();
  renderHero(demoProfile);
  routeToCurrentProfile();
  $("#admin-open").addEventListener("click", openModal);
  $("#explore-button").addEventListener("click", () => showProfile(demoProfile, true));
  $("#back-home").addEventListener("click", () => { history.pushState({}, "", location.pathname); showLanding(); });
  $$('[data-close-modal]').forEach((button) => button.addEventListener("click", closeModal));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
  window.addEventListener("popstate", routeToCurrentProfile);
  $("#login-form").addEventListener("submit", signIn);
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#new-profile").addEventListener("click", openNewProfile);
  $("#cancel-edit").addEventListener("click", resetEditor);
  $("#delete-profile").addEventListener("click", deleteProfile);
  $("#sign-out").addEventListener("click", signOut);
  $("#profile-form input[name=display_name]").addEventListener("input", (event) => {
    if (!editingProfile && !$("#profile-form input[name=slug]").dataset.edited) $("#profile-form input[name=slug]").value = escapeSlug(event.target.value);
  });
  $("#profile-form input[name=slug]").addEventListener("input", (event) => { event.target.dataset.edited = "true"; event.target.value = escapeSlug(event.target.value); });
  if (configured) client.auth.onAuthStateChange((_event, session) => { if (!session && currentAdmin) showLogin("Your session has ended. Please sign in again."); });
}

initialize();
