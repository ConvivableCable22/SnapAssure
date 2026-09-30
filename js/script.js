/* ============================================================
   SnapAssure — Main Site Script
   Handles:
     - Light Mode & Dark Mode with Persistence & System Detection
     - Unified Reusable Enquiry / Quote Form Component & Modal
     - Touch-friendly Mobile Navigation & Scroll Lock
     - Client Logo Wall & Dynamic Catalogue Experiences
     - Full Lightbox Photo Viewer
     - SOMA AI Assistant Chat & Voice Control Integration
     - Dynamic SOMA Assistant States: IDLE, LISTENING, THINKING, SPEAKING
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  $("year").textContent = new Date().getFullYear();

  /* ================================================================
     1. THEME MANAGER: Light / Dark Mode
     ================================================================ */
  const ThemeManager = {
    key: "snapassure_theme",

    init() {
      const saved = localStorage.getItem(this.key);
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initialTheme = saved || (prefersDark ? "dark" : "light");
      this.apply(initialTheme, false);

      // Listen for system color-scheme changes if no manual override was set
      if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
          if (!localStorage.getItem(this.key)) {
            this.apply(e.matches ? "dark" : "light", false);
          }
        });
      }

      const toggles = [ $("themeToggleBtn"), $("mobileThemeToggleBtn") ].filter(Boolean);
      toggles.forEach((btn) => {
        btn.addEventListener("click", () => this.toggle());
      });
    },

    apply(theme, save = true) {
      document.documentElement.setAttribute("data-theme", theme);
      if (save) {
        try { localStorage.setItem(this.key, theme); } catch (e) {}
      }

      const isDark = theme === "dark";
      const statusText = $("mobileThemeStatusText");
      if (statusText) statusText.textContent = isDark ? "Dark Mode" : "Light Mode";

      const toggleBtn = $("themeToggleBtn");
      if (toggleBtn) {
        const nextMode = isDark ? "light" : "dark";
        toggleBtn.setAttribute("aria-label", `Switch to ${nextMode} mode`);
        toggleBtn.setAttribute("title", `Switch to ${nextMode} mode`);
      }
    },

    toggle() {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      this.apply(next, true);
    }
  };

  ThemeManager.init();

  /* ================================================================
     2. MOBILE NAVIGATION (Touch-friendly drawer with scroll lock)
     ================================================================ */
  const hamburgerBtn = $("hamburgerBtn");
  const mobileMenu = $("mobileMenu");

  function toggleMobileMenu(forceClose = false) {
    const shouldOpen = forceClose ? false : !mobileMenu.classList.contains("open");
    mobileMenu.classList.toggle("open", shouldOpen);
    hamburgerBtn.classList.toggle("open", shouldOpen);
    hamburgerBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    document.body.classList.toggle("menu-open", shouldOpen);
  }

  if (hamburgerBtn && mobileMenu) {
    hamburgerBtn.addEventListener("click", () => toggleMobileMenu());

    mobileMenu.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => toggleMobileMenu(true));
    });

    // Close mobile menu on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileMenu.classList.contains("open")) {
        toggleMobileMenu(true);
        hamburgerBtn.focus();
      }
    });
  }

  /* ================================================================
     2.5 SMOOTH INSTANT NAVIGATION & PILL SLIDER
     ================================================================ */
  function initLogoWall() {
    const wall = $("logoWall");
    if (wall) {
      wall.innerHTML = "";
      const ROW_ENDS = [6, 11, 15, 19, 23]; // Matches PDF's logo grid layout
      COMPANY_INFO.clientLogos.forEach((c, i) => {
        if (ROW_ENDS.includes(i)) {
          const br = document.createElement("li");
          br.className = "row-break";
          br.setAttribute("aria-hidden", "true");
          wall.appendChild(br);
        }
        const cell = document.createElement("li");
        cell.className = "logo-cell";
        if (c.color) {
          cell.style.setProperty("--brand-color", c.color);
        }
        const webpSrc = c.src.replace(/\.(jpe?g|png)$/i, ".webp");
        cell.innerHTML = `<picture>
          <source srcset="${webpSrc}" type="image/webp">
          <img src="${c.src}" alt="${esc(c.name)}" loading="lazy" decoding="async">
        </picture>`;
        wall.appendChild(cell);
      });
    }

    const tSlot = $("testimonialsSlot");
    if (tSlot) {
      const badgeImg = `<picture>
        <source srcset="assets/icons/testimonials-badge.webp" type="image/webp">
        <img class="badge" src="assets/icons/testimonials-badge.png" alt="Testimonials" width="492" height="118" loading="lazy" decoding="async">
      </picture>`;
      tSlot.innerHTML = COMPANY_INFO.testimonialsUrl
        ? `<a href="${esc(COMPANY_INFO.testimonialsUrl)}" target="_blank" rel="noopener">${badgeImg}</a>`
        : badgeImg;
    }
  }

  function populateExperienceDropdowns() {
    const fExperience = $("fExperience");
    const mExperience = $("mExperience");

    if (fExperience && fExperience.children.length <= 1) {
      EXPERIENCES.forEach((exp) => {
        const optInpage = document.createElement("option");
        optInpage.value = exp.id;
        optInpage.textContent = exp.title;
        fExperience.appendChild(optInpage);
      });
    }

    if (mExperience && mExperience.children.length <= 1) {
      EXPERIENCES.forEach((exp) => {
        const optModal = document.createElement("option");
        optModal.value = exp.id;
        optModal.textContent = exp.title;
        mExperience.appendChild(optModal);
      });
    }
  }

  function reinitPageFeatures() {
    initLogoWall();
    populateExperienceDropdowns();
    if (typeof initExperiencesPage === "function") {
      initExperiencesPage();
    }
    if (typeof UnifiedEnquiryController !== "undefined" && UnifiedEnquiryController && typeof UnifiedEnquiryController.initInpageForm === "function") {
      UnifiedEnquiryController.initInpageForm();
    }
  }

  const SmoothNavigationController = {
    cache: new Map(),
    isTransitioning: false,

    init() {
      this.navLinks = document.querySelector(".nav-links");
      if (!this.navLinks) return;

      this.indicator = this.navLinks.querySelector(".nav-indicator");
      if (!this.indicator) {
        this.indicator = document.createElement("li");
        this.indicator.className = "nav-indicator";
        this.indicator.setAttribute("aria-hidden", "true");
        this.navLinks.prepend(this.indicator);
      }

      this.items = Array.from(this.navLinks.querySelectorAll("a"));
      this.mobileNavLinks = Array.from(document.querySelectorAll(".mobile-nav-links a"));

      const activeLink = this.getActiveNavLink();
      if (activeLink) {
        this.positionIndicator(activeLink, false);
      }

      let resizeRaf = null;
      window.addEventListener("resize", () => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = null;
          const current = this.getActiveNavLink();
          if (current) this.positionIndicator(current, false);
        });
      }, { passive: true });

      window.addEventListener("popstate", () => {
        const href = window.location.pathname.split("/").pop() || "index.html";
        this.navigate(href + window.location.hash, false);
      });

      // Intercept navigation link clicks
      document.addEventListener("click", (e) => {
        const link = e.target.closest("a");
        if (!link) return;

        const href = link.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:") || link.target === "_blank") {
          return;
        }

        const cleanPath = href.split("#")[0].split("?")[0];
        if (!["index.html", "experiences.html", "clients.html", ""].includes(cleanPath)) {
          return;
        }

        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        e.preventDefault();
        this.navigate(href, true);
      });

      // Prefetch on pointerenter / touchstart
      document.addEventListener("pointerenter", (e) => {
        const link = e.target.closest("a");
        if (!link) return;
        const href = link.getAttribute("href");
        if (href && ["index.html", "experiences.html", "clients.html"].includes(href.split("#")[0].split("?")[0])) {
          this.prefetch(href);
        }
      }, { passive: true });

      // Background prefetch when idle
      const prefetchPages = () => {
        ["index.html", "experiences.html", "clients.html"].forEach((p) => this.prefetch(p));
      };
      if ("requestIdleCallback" in window) {
        requestIdleCallback(prefetchPages);
      } else {
        setTimeout(prefetchPages, 600);
      }
    },

    getActiveNavLink() {
      const currentPath = window.location.pathname.split("/").pop() || "index.html";
      return this.items.find((a) => {
        const h = a.getAttribute("href");
        return h === currentPath || (currentPath === "index.html" && (h === "./" || h === "index.html" || h === "/"));
      }) || this.navLinks.querySelector("a.active") || this.items[0];
    },

    positionIndicator(target, animate = true) {
      if (!target || !this.indicator) return;
      const targetRect = target.getBoundingClientRect();
      const navRect = this.navLinks.getBoundingClientRect();
      const x = targetRect.left - navRect.left;
      const w = targetRect.width;

      if (!animate) {
        this.indicator.style.transition = "none";
      } else {
        this.indicator.style.transition = "";
      }

      this.indicator.style.transform = `translateX(${x}px)`;
      this.indicator.style.width = `${w}px`;
      this.indicator.style.opacity = "1";

      if (!animate) {
        this.indicator.getBoundingClientRect(); // force reflow
        this.indicator.style.transition = "";
      }
    },

    async prefetch(url) {
      const cleanUrl = url.split("#")[0].split("?")[0] || "index.html";
      if (this.cache.has(cleanUrl)) return;
      try {
        const res = await fetch(cleanUrl);
        if (res.ok) {
          const html = await res.text();
          this.cache.set(cleanUrl, html);
        }
      } catch (err) {}
    },

    async navigate(targetUrl, pushState = true) {
      const [pathWithParams, hash] = targetUrl.split("#");
      const cleanPath = pathWithParams.split("?")[0] || "index.html";
      const currentPath = window.location.pathname.split("/").pop() || "index.html";

      // If on the exact same page with a hash, smooth scroll to it
      if (cleanPath === currentPath && hash) {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        if (pushState) window.history.pushState(null, "", targetUrl);
        return;
      }

      // If on the exact same page without a hash, smooth scroll to top
      if (cleanPath === currentPath && !hash) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (this.isTransitioning) return;
      this.isTransitioning = true;

      // Close mobile drawer if open
      if (typeof toggleMobileMenu === "function") {
        toggleMobileMenu(true);
      }

      // Update active nav link & slide pill indicator immediately
      const targetNav = this.items.find((a) => {
        const h = a.getAttribute("href");
        return h === cleanPath || (cleanPath === "index.html" && (h === "./" || h === "index.html"));
      });
      if (targetNav) {
        this.items.forEach((a) => {
          const isTarget = a === targetNav;
          a.classList.toggle("active", isTarget);
          if (isTarget) a.setAttribute("aria-current", "page");
          else a.removeAttribute("aria-current");
        });
        this.mobileNavLinks.forEach((a) => {
          const h = a.getAttribute("href");
          a.classList.toggle("active", h === cleanPath || (cleanPath === "index.html" && h === "index.html"));
        });
        this.positionIndicator(targetNav, true);
      }

      const main = document.getElementById("main");

      try {
        // Start smooth fade-out of current #main
        if (main) {
          main.classList.remove("page-transition-in-prep");
          main.classList.add("page-transition-out");
        }

        // Retrieve from prefetch cache or fetch from server
        let html = this.cache.get(cleanPath);
        if (!html) {
          const res = await fetch(cleanPath);
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          html = await res.text();
          this.cache.set(cleanPath, html);
        }

        // Wait 130ms for exit animation to complete smoothly
        await new Promise((r) => setTimeout(r, 130));

        // Parse new HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const newMain = doc.querySelector("#main");
        if (!newMain) throw new Error("Target #main not found");

        // Swap main content
        if (main) {
          main.innerHTML = newMain.innerHTML;
          main.className = newMain.className;
        }

        // Update document title
        if (doc.title) {
          document.title = doc.title;
        }

        // Update browser URL history
        if (pushState) {
          window.history.pushState(null, "", targetUrl);
        }

        // Scroll to top (or to hash target if provided)
        if (hash) {
          const targetEl = document.getElementById(hash);
          if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.scrollTo({ top: 0, behavior: "instant" });
        } else {
          window.scrollTo({ top: 0, behavior: "instant" });
        }

        // Re-mount page-specific components
        reinitPageFeatures();

        // Animate new #main into view with subtle upward glide
        if (main) {
          main.classList.remove("page-transition-out");
          main.classList.add("page-transition-in-prep");

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              main.classList.remove("page-transition-in-prep");
              this.isTransitioning = false;
            });
          });
        } else {
          this.isTransitioning = false;
        }
      } catch (err) {
        console.warn("[Navigation] Fallback to native navigation:", err.message);
        this.isTransitioning = false;
        window.location.href = targetUrl;
      }
    }
  };

  initLogoWall();
  populateExperienceDropdowns();
  SmoothNavigationController.init();

  /* ================================================================
     5. UNIFIED REUSABLE ENQUIRY / QUOTE CONTROLLER
        (Single source of truth for General Enquiry & Request a Quote)
     ================================================================ */
  const UnifiedEnquiryController = {
    currentMode: "enquiry", // "enquiry" | "quote"
    lastOpener: null,

    // Form DOM Elements (Modal)
    modal: $("enquiryModal"),
    modalCloseBtn: $("modalCloseBtn"),
    modalForm: $("modalEnquiryForm"),
    modalBadge: $("modalBadge"),
    modalTitle: $("modalFormTitle"),
    modalSubtitle: $("modalSubtitle"),
    modalTabEnquiry: $("modalTabEnquiry"),
    modalTabQuote: $("modalTabQuote"),
    modalSubmitBtn: $("modalSubmitBtn"),
    modalSubmitText: $("modalSubmitText"),
    modalWaBtn: $("modalWaBtn"),
    modalFormError: $("modalFormError"),
    modalLoadingView: $("modalLoadingView"),
    modalSuccessView: $("modalSuccessView"),
    modalSuccessTitle: $("modalSuccessTitle"),
    modalSuccessBody: $("modalSuccessBody"),
    successWaBtn: $("successWaBtn"),
    modalDoneBtn: $("modalDoneBtn"),

    // Form DOM Elements (Inpage)
    inpageForm: $("contactForm"),
    inpageBadge: $("inpageFormBadge"),
    inpageTabEnquiry: $("tabEnquiry"),
    inpageTabQuote: $("tabQuote"),
    inpageSubmitBtn: $("inpageSubmitBtn"),
    inpageSubmitText: $("inpageSubmitText"),
    inpageWaBtn: $("waBtn"),
    inpageClearBtn: $("inpageClearBtn"),
    inpageFormError: $("inpageFormError"),
    inpageSuccessView: $("inpageSuccessView"),
    inpageSuccessWaBtn: $("inpageSuccessWaBtn"),
    inpageResetBtn: $("inpageResetBtn"),
    formStatus: $("formStatus"),

    initInpageForm() {
      this.inpageForm = $("contactForm");
      this.inpageBadge = $("inpageFormBadge");
      this.inpageTabEnquiry = $("tabEnquiry");
      this.inpageTabQuote = $("tabQuote");
      this.inpageSubmitBtn = $("inpageSubmitBtn");
      this.inpageSubmitText = $("inpageSubmitText");
      this.inpageWaBtn = $("waBtn");
      this.inpageClearBtn = $("inpageClearBtn");
      this.inpageFormError = $("inpageFormError");
      this.inpageSuccessView = $("inpageSuccessView");
      this.inpageSuccessWaBtn = $("inpageSuccessWaBtn");
      this.inpageResetBtn = $("inpageResetBtn");
      this.formStatus = $("formStatus");

      if (!this.inpageForm) return;

      // Inpage tab switches
      if (this.inpageTabEnquiry && !this.inpageTabEnquiry._bound) {
        this.inpageTabEnquiry._bound = true;
        this.inpageTabEnquiry.addEventListener("click", () => this.setMode("enquiry"));
      }
      if (this.inpageTabQuote && !this.inpageTabQuote._bound) {
        this.inpageTabQuote._bound = true;
        this.inpageTabQuote.addEventListener("click", () => this.setMode("quote"));
      }

      // Inpage form submit
      if (!this.inpageForm._bound) {
        this.inpageForm._bound = true;
        this.inpageForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleSubmit("inpage");
        });
      }

      // Inpage WhatsApp button
      if (this.inpageWaBtn && !this.inpageWaBtn._bound) {
        this.inpageWaBtn._bound = true;
        this.inpageWaBtn.addEventListener("click", () => {
          this.handleWhatsApp("inpage");
        });
      }

      // Inpage Clear button
      if (this.inpageClearBtn && !this.inpageClearBtn._bound) {
        this.inpageClearBtn._bound = true;
        this.inpageClearBtn.addEventListener("click", () => {
          if (this.inpageForm) this.inpageForm.reset();
          this.clearFieldErrors("inpage");
          if (this.inpageFormError) this.inpageFormError.hidden = true;
          if (this.formStatus) this.formStatus.textContent = "";
          const firstField = $("fName");
          if (firstField) firstField.focus();
        });
      }

      // Inpage Success WhatsApp button
      if (this.inpageSuccessWaBtn && !this.inpageSuccessWaBtn._bound) {
        this.inpageSuccessWaBtn._bound = true;
        this.inpageSuccessWaBtn.addEventListener("click", () => {
          this.openWhatsAppDirect("inpage");
        });
      }

      // Inpage Reset button
      if (this.inpageResetBtn && !this.inpageResetBtn._bound) {
        this.inpageResetBtn._bound = true;
        this.inpageResetBtn.addEventListener("click", () => {
          this.resetInpageSuccess();
        });
      }

      this.setupFieldSync();
    },

    init() {
      // Modal tab switches
      if (this.modalTabEnquiry) this.modalTabEnquiry.addEventListener("click", () => this.setMode("enquiry"));
      if (this.modalTabQuote) this.modalTabQuote.addEventListener("click", () => this.setMode("quote"));

      // Modal open triggers via event delegation on document (works across all pages & content swaps)
      document.addEventListener("click", (e) => {
        const quoteBtn = e.target.closest('[data-mode="quote"]');
        if (quoteBtn) {
          e.preventDefault();
          this.openModal("quote", quoteBtn.getAttribute("data-enquire") || "", quoteBtn);
          return;
        }
        const enqBtn = e.target.closest('[data-mode="enquiry"]');
        if (enqBtn) {
          e.preventDefault();
          this.openModal("enquiry", enqBtn.getAttribute("data-enquire") || "", enqBtn);
          return;
        }
      });

      // Modal close events
      if (this.modalCloseBtn) this.modalCloseBtn.addEventListener("click", () => this.closeModal());
      if (this.modalDoneBtn) this.modalDoneBtn.addEventListener("click", () => this.closeModal());
      if (this.modal) {
        this.modal.addEventListener("click", (e) => {
          if (e.target === this.modal) this.closeModal();
        });

        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && this.modal && !this.modal.hidden) {
            this.closeModal();
          }
        });
      }

      // Modal form submit
      if (this.modalForm) {
        this.modalForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleSubmit("modal");
        });
      }

      // Modal WhatsApp button
      if (this.modalWaBtn) {
        this.modalWaBtn.addEventListener("click", () => {
          this.handleWhatsApp("modal");
        });
      }

      // Modal Success WhatsApp button
      if (this.successWaBtn) {
        this.successWaBtn.addEventListener("click", () => {
          this.openWhatsAppDirect("modal");
        });
      }

      // Initialize inpage form
      this.initInpageForm();

      // Header & Mobile "GENERAL ENQUIRY" CTA handling
      const handleEnquiryNavClick = (e) => {
        if (e) e.preventDefault();
        const inpageTarget = $("enquiry") || $("inpageFormCard");
        if (inpageTarget) {
          if (typeof toggleMobileMenu === "function") {
            toggleMobileMenu(true);
          }
          this.setMode("enquiry");
          inpageTarget.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => {
            const firstField = $("fName");
            if (firstField) firstField.focus();
          }, 500);
        } else {
          SmoothNavigationController.navigate("index.html#enquiry");
        }
      };

      const navQuoteBtn = $("navQuoteBtn");
      if (navQuoteBtn) {
        navQuoteBtn.addEventListener("click", handleEnquiryNavClick);
      }

      const mobileQuoteBtn = $("mobileQuoteBtn");
      if (mobileQuoteBtn) {
        mobileQuoteBtn.addEventListener("click", handleEnquiryNavClick);
      }

      // Check if page opened with #enquiry hash
      if (window.location.hash === "#enquiry" && ($("enquiry") || $("inpageFormCard"))) {
        this.setMode("enquiry");
        setTimeout(() => {
          const inpageTarget = $("enquiry") || $("inpageFormCard");
          if (inpageTarget) {
            inpageTarget.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 150);
      }

      window.addEventListener("hashchange", () => {
        if (window.location.hash === "#enquiry" && ($("enquiry") || $("inpageFormCard"))) {
          this.setMode("enquiry");
          const inpageTarget = $("enquiry") || $("inpageFormCard");
          if (inpageTarget) {
            inpageTarget.scrollIntoView({ behavior: "smooth", block: "start" });
            setTimeout(() => {
              const firstField = $("fName");
              if (firstField) firstField.focus();
            }, 500);
          }
        }
      });
    },

    setMode(mode = "enquiry") {
      this.currentMode = mode;
      const isQuote = mode === "quote";

      // Sync modal tab selection
      if (this.modalTabEnquiry) this.modalTabEnquiry.setAttribute("aria-selected", isQuote ? "false" : "true");
      if (this.modalTabQuote) this.modalTabQuote.setAttribute("aria-selected", isQuote ? "true" : "false");

      // Sync inpage tab selection (if tabs present)
      if (this.inpageTabEnquiry) this.inpageTabEnquiry.setAttribute("aria-selected", isQuote ? "false" : "true");
      if (this.inpageTabQuote) this.inpageTabQuote.setAttribute("aria-selected", isQuote ? "true" : "false");

      // Update Modal Texts
      if (isQuote) {
        if (this.modalBadge) this.modalBadge.textContent = "REQUEST A QUOTE";
        if (this.modalTitle) this.modalTitle.textContent = "Request a Quote";
        if (this.modalSubtitle) this.modalSubtitle.textContent = "Share your event requirements for a detailed, customized interactive booth quote.";
        if (this.modalSubmitText) this.modalSubmitText.textContent = "Request Custom Quote";
      } else {
        if (this.modalBadge) this.modalBadge.textContent = "GENERAL ENQUIRY";
        if (this.modalTitle) this.modalTitle.textContent = "General Enquiry";
        if (this.modalSubtitle) this.modalSubtitle.textContent = "Tell us about your celebration and we'll craft the perfect interactive booth experience.";
        if (this.modalSubmitText) this.modalSubmitText.textContent = "Submit General Enquiry";
      }

      // Inpage form is always General Enquiry
      if (this.inpageBadge) this.inpageBadge.textContent = "GENERAL ENQUIRY";
      if (this.inpageSubmitText) this.inpageSubmitText.textContent = "Submit General Enquiry";

      // Update in-page card mode class and description
      const inpageCard = $("inpageFormCard");
      if (inpageCard) {
        inpageCard.classList.toggle("mode-quote", isQuote);
      }

      const formModeDesc = $("formModeDesc");
      if (formModeDesc) {
        formModeDesc.textContent = isQuote
          ? "Share your event requirements for an itemized, custom interactive booth proposal & pricing breakdown."
          : "Have questions or want to brainstorm ideas? Drop us a note and we'll guide your celebration.";
      }
    },

    openModal(mode = "enquiry", experienceId = "", opener = null) {
      this.lastOpener = opener || document.activeElement;
      this.setMode(mode);

      if (experienceId) {
        if ($("mExperience")) $("mExperience").value = experienceId;
        if ($("fExperience")) $("fExperience").value = experienceId;
      }

      // Reset modal state views
      this.modalForm.hidden = false;
      this.modalLoadingView.hidden = true;
      this.modalSuccessView.hidden = true;
      this.modalFormError.hidden = true;
      this.clearFieldErrors("modal");

      this.modal.hidden = false;
      document.body.style.overflow = "hidden";

      // Focus first input or close button
      setTimeout(() => {
        const firstField = $("mName");
        if (firstField) firstField.focus();
        else this.modalCloseBtn.focus();
      }, 60);
    },

    closeModal() {
      this.modal.hidden = true;
      document.body.style.overflow = "";
      if (this.lastOpener && typeof this.lastOpener.focus === "function") {
        this.lastOpener.focus();
      }
    },

    setupFieldSync() {
      const fieldPairs = [
        ["mName", "fName"],
        ["mPhone", "fPhone"],
        ["mEmail", "fEmail"],
        ["mEventType", "fEventType"],
        ["mEventDate", "fEventDate"],
        ["mCity", "fCity"],
        ["mGuests", "fGuests"],
        ["mExperience", "fExperience"],
        ["mMessage", "fMessage"]
      ];

      fieldPairs.forEach(([mId, fId]) => {
        const mEl = $(mId);
        const fEl = $(fId);
        if (!mEl || !fEl) return;

        mEl.addEventListener("input", () => { fEl.value = mEl.value; });
        fEl.addEventListener("input", () => { mEl.value = fEl.value; });
        mEl.addEventListener("change", () => { fEl.value = mEl.value; });
        fEl.addEventListener("change", () => { mEl.value = fEl.value; });
      });
    },

    validate(scope = "modal") {
      const prefix = scope === "modal" ? "m" : "f";
      const name = $(`${prefix}Name`);
      const phone = $(`${prefix}Phone`);
      const email = $(`${prefix}Email`);
      const formError = scope === "modal" ? this.modalFormError : this.inpageFormError;

      if (!name || !phone || !email) return true;
      let valid = true;

      // Full Name Validation
      const isNameOk = name.value.trim().length >= 2;
      this.setFieldValid(name.closest(".field"), isNameOk);
      if (!isNameOk) valid = false;

      // Phone Validation (min 7 digits, supports +, spaces, dashes)
      const isPhoneOk = /^[\d+\-\s()]{7,16}$/.test(phone.value.trim());
      this.setFieldValid(phone.closest(".field"), isPhoneOk);
      if (!isPhoneOk) valid = false;

      // Email Validation
      const isEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      this.setFieldValid(email.closest(".field"), isEmailOk);
      if (!isEmailOk) valid = false;

      if (!valid) {
        if (formError) {
          formError.hidden = false;
          formError.textContent = "Please fix the highlighted required fields.";
        }
        // Focus the first invalid input
        const formEl = scope === "modal" ? this.modalForm : this.inpageForm;
        if (formEl) {
          const firstInvalid = formEl.querySelector(".field.invalid input");
          if (firstInvalid) firstInvalid.focus();
        }
      } else if (formError) {
        formError.hidden = true;
      }

      return valid;
    },

    setFieldValid(fieldEl, ok) {
      if (!fieldEl) return;
      fieldEl.classList.toggle("invalid", !ok);
    },

    clearFieldErrors(scope = "modal") {
      const form = scope === "modal" ? this.modalForm : this.inpageForm;
      if (!form) return;
      form.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
      if (scope === "modal") {
        if (this.modalFormError) this.modalFormError.hidden = true;
      } else {
        if (this.inpageFormError) this.inpageFormError.hidden = true;
      }
    },

    isSubmitting: false,

    getFormData(scope = "modal") {
      const prefix = scope === "modal" ? "m" : "f";
      const v = (id) => {
        const el = $(`${prefix}${id}`);
        return el && typeof el.value === "string" ? el.value.trim() : "";
      };
      const expId = v("Experience");
      const expTitle = expId && EXPERIENCES_BY_ID[expId] ? EXPERIENCES_BY_ID[expId].title : expId;

      return {
        name: v("Name"),
        phone: v("Phone"),
        email: v("Email"),
        eventType: v("EventType"),
        eventDate: v("EventDate"),
        city: v("City"),
        guests: v("Guests"),
        experience: expTitle || v("Experience"),
        message: v("Message"),
        mode: this.currentMode || "enquiry"
      };
    },

    formatMessage(scope = "modal") {
      const data = this.getFormData(scope);
      const isQuote = this.currentMode === "quote";

      const lines = [
        `*SnapAssure — ${isQuote ? "Quote Request" : "General Enquiry"}*`,
        `Name: ${data.name}`,
        `Phone: ${data.phone}`,
        `Email: ${data.email}`,
        data.eventType && `Event Type: ${data.eventType}`,
        data.eventDate && `Event Date: ${data.eventDate}`,
        data.city && `City / Location: ${data.city}`,
        data.guests && `Number of Guests: ${data.guests}`,
        data.experience && `Interested Experience: ${data.experience}`,
        data.message && `\nMessage / Requirements:\n${data.message}`
      ].filter(Boolean);

      return lines.join("\n");
    },

    async handleSubmit(scope = "modal") {
      if (this.isSubmitting) return;
      if (!this.validate(scope)) return;

      this.isSubmitting = true;
      const data = this.getFormData(scope);

      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
      let endpoint = (window.SOMA_CONFIG && window.SOMA_CONFIG.enquiryUrl) || (isHttps ? "/api/enquiry" : "http://localhost:3000/api/enquiry");
      if (isHttps && endpoint.startsWith("http://localhost")) {
        endpoint = "/api/enquiry";
      }

      let btn = null;
      let spinner = null;

      if (scope === "modal") {
        btn = this.modalSubmitBtn;
        if (btn) btn.disabled = true;
        if (this.modalForm) this.modalForm.hidden = true;
        if (this.modalLoadingView) this.modalLoadingView.hidden = false;
        if (this.modalFormError) this.modalFormError.hidden = true;
      } else {
        btn = this.inpageSubmitBtn;
        if (btn) {
          btn.disabled = true;
          spinner = btn.querySelector(".btn-spinner");
          if (spinner) spinner.hidden = false;
        }
        if (this.inpageFormError) this.inpageFormError.hidden = true;
      }

      let result = null;
      let networkError = null;

      // 1. Try server endpoint (/api/enquiry)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(data)
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          result = await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned status ${res.status}`);
        }
      } catch (err) {
        console.warn("[Enquiry] Primary enquiry endpoint unavailable:", err.message);
        networkError = err;
      }

      // 2. Direct Supabase REST fallback (works directly on static Netlify host)
      if (!result || !result.saved) {
        try {
          const sbUrl = window.SOMA_CONFIG && window.SOMA_CONFIG.supabaseUrl;
          const sbKey = window.SOMA_CONFIG && window.SOMA_CONFIG.supabaseAnonKey;
          if (sbUrl && sbKey) {
            const row = {
              id: `enq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: String(data.name || "").trim(),
              email: String(data.email || "").trim(),
              phone: String(data.phone || "").trim(),
              subject: data.mode === "quote" ? "Request a Quote" : "General Enquiry",
              mode: data.mode || "enquiry",
              event_type: data.eventType || null,
              event_date: data.eventDate || null,
              city: data.city || null,
              guests: data.guests != null ? String(data.guests) : null,
              experience: data.experience || null,
              message: data.message || null,
              email_status: "pending_direct",
              submitted_at: new Date().toISOString(),
              formatted_date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"
            };

            const sbRes = await fetch(`${sbUrl}/rest/v1/enquiries`, {
              method: "POST",
              headers: {
                "apikey": sbKey,
                "Authorization": `Bearer ${sbKey}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation"
              },
              body: JSON.stringify(row)
            });

            if (sbRes.ok) {
              result = {
                saved: true,
                emailSent: false,
                id: row.id,
                message: "Thank you! Your enquiry has been safely received."
              };
            }
          }
        } catch (sbErr) {
          console.warn("[Enquiry] Direct Supabase fallback warning:", sbErr.message);
        }
      }

      // Check results
      if (result && result.saved) {
        const isEmailSent = Boolean(result.emailSent);

        if (scope === "modal") {
          if (this.modalLoadingView) this.modalLoadingView.hidden = true;
          if (this.modalSuccessView) this.modalSuccessView.hidden = false;

          if (this.modalSuccessTitle) {
            this.modalSuccessTitle.textContent = isEmailSent
              ? "Thank you! Your enquiry has been received."
              : "Thank you! Your enquiry has been saved.";
          }
          if (this.modalSuccessBody) {
            this.modalSuccessBody.textContent = isEmailSent
              ? "Your details have been emailed directly to snapassure@gmail.com. Our team will get back to you shortly!"
              : "Your enquiry details are safely recorded in our system. The SnapAssure team will contact you shortly!";
          }
          if (this.modalForm) this.modalForm.reset();
        } else {
          if (this.inpageForm) {
            this.inpageForm.hidden = true;
            this.inpageForm.reset();
          }
          if (this.inpageSuccessView) {
            this.inpageSuccessView.hidden = false;
            const titleEl = this.inpageSuccessView.querySelector(".success-title");
            const descEl = this.inpageSuccessView.querySelector(".success-desc");
            if (titleEl) {
              titleEl.textContent = isEmailSent
                ? "Thank you! Your enquiry has been received."
                : "Thank you! Your enquiry has been saved.";
            }
            if (descEl) {
              descEl.textContent = isEmailSent
                ? "Your enquiry has been delivered to snapassure@gmail.com. We will be in touch shortly!"
                : "Your details have been saved in our system. Our team will review and get in touch with you shortly!";
            }
          }
        }
      } else {
        // Submission failed or network error
        const errMsg = networkError
          ? "Unable to connect to the enquiry service. Please check your connection or reach us directly at +91 9601514454."
          : (result?.error || "There was a problem submitting your enquiry. Please try again.");

        if (scope === "modal") {
          if (this.modalLoadingView) this.modalLoadingView.hidden = true;
          if (this.modalForm) this.modalForm.hidden = false;
          if (this.modalFormError) {
            this.modalFormError.hidden = false;
            this.modalFormError.textContent = errMsg;
          }
        } else {
          if (this.inpageFormError) {
            this.inpageFormError.hidden = false;
            this.inpageFormError.textContent = errMsg;
          }
        }
      }

      this.isSubmitting = false;
      if (btn) btn.disabled = false;
      if (spinner) spinner.hidden = true;
    },

    handleWhatsApp(scope = "modal") {
      if (!this.validate(scope)) return;
      this.openWhatsAppDirect(scope);
    },

    openWhatsAppDirect(scope = "modal") {
      const body = this.formatMessage(scope);
      const url = `https://wa.me/919601514454?text=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener");
    },

    resetInpageSuccess() {
      this.inpageForm.hidden = false;
      this.inpageSuccessView.hidden = true;
      this.inpageFormError.hidden = true;
      this.clearFieldErrors("inpage");
    }
  };

  UnifiedEnquiryController.init();


  /* ================================================================
     7. LUXURY EXPERIENCE SUITE (Card Grid & Immersive Showcase Modal)
     ================================================================ */
  let gridEl = $("experiencesGrid");
  let gridFooter = $("gridFooter");
  let gridShowingMeta = $("gridShowingMeta");
  let loadMoreBtn = $("loadMoreBtn");
  let chipsWrap = $("filterChips");
  let searchInput = $("searchInput");
  let searchBox = $("searchBox");
  let clearSearchBtn = $("clearSearchBtn");
  let searchMicBtn = $("searchMicBtn");
  let resultsMeta = $("resultsMeta");
  let noResults = $("noResults");
  let resetFiltersBtn = $("resetFiltersBtn");

  const INITIAL_BATCH = 9;
  const BATCH_INCREMENT = 9;
  let state = { query: "", category: "All", visibleCount: INITIAL_BATCH };

  function createShowcaseMarkup(exp) {
    const n = exp.images.length;
    const isLandscape = exp.imageSizes && exp.imageSizes[0] && (exp.imageSizes[0][0] / exp.imageSizes[0][1] > 1.05);
    const shots = exp.images.map((src, i) => {
      const [w, h] = exp.imageSizes[i] || [1200, 1200];
      const webp = src.replace(/\.(jpe?g|png)$/i, ".webp");
      return `<figure class="shot${exp.framed ? " framed" : ""}">
        <button type="button" class="shot-btn" data-exp="${exp.id}" data-i="${i}" aria-label="Enlarge photo ${i + 1} of ${n}: ${esc(exp.title)}">
          <picture>
            <source srcset="${webp}" type="image/webp">
            <img src="${src}" alt="${esc(exp.title)} — photo ${i + 1} of ${n}" width="${w}" height="${h}" style="--r:${(w / h).toFixed(4)}" loading="eager" decoding="async">
          </picture>
        </button>
      </figure>`;
    }).join("");

    const nav = n > 1 ? `<div class="gallery-nav">
        <button type="button" class="g-prev" aria-label="Previous photo">‹</button>
        <button type="button" class="g-next" aria-label="Next photo">›</button>
      </div>` : "";

    const featureChips = (exp.features && exp.features.length)
      ? `<div class="sheet-features-row" aria-label="Highlights">
          ${exp.features.slice(0, 4).map((f) => `<span class="sheet-feature-tag"><span class="tag-spark" aria-hidden="true">✦</span> ${esc(f)}</span>`).join("")}
        </div>`
      : (exp.tags && exp.tags.length)
      ? `<div class="sheet-features-row" aria-label="Tags">
          ${exp.tags.slice(0, 4).map((t) => `<span class="sheet-feature-tag"><span class="tag-spark" aria-hidden="true">✦</span> ${esc(t)}</span>`).join("")}
        </div>`
      : "";

    const suitableRow = (exp.suitableFor && exp.suitableFor.length)
      ? `<div class="sheet-suitable-row" aria-label="Ideal for events">
          <span class="suitable-title">IDEAL FOR:</span>
          ${exp.suitableFor.slice(0, 4).map((s) => `<span class="suitable-pill">${esc(s)}</span>`).join("")}
        </div>`
      : "";

    const expIndexNum = String(Math.max(1, exp.pdfPage - 2)).padStart(2, "0");
    const mediaBadgeText = n > 1 ? `${n} Showcase Photos` : (isLandscape ? "Panoramic Experience" : "Studio Portrait");

    return `
      <div class="sheet-grid" data-density="standard">
        <div class="sheet-text">
          <div class="sheet-header-group">
            <div class="sheet-meta-pill">
              <span class="sheet-cat-chip">${esc(exp.category || "Experience")}</span>
              <span class="sheet-index-chip">Exp ${expIndexNum} / 44</span>
            </div>
            <h2 class="sheet-title" id="expModalTitle">${esc(exp.title)}</h2>
            ${exp.tagline ? `<p class="sheet-tagline">${esc(exp.tagline)}</p>` : ""}
            <div class="sheet-copy-wrap">
              ${exp.copy.map((p) => `<p>${esc(p)}</p>`).join("")}
            </div>
          </div>
          <div class="sheet-details-group">
            ${featureChips}
            ${suitableRow}
          </div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-primary modal-enquire-btn" data-enquire="${exp.id}">
              <span>Enquire about this booth</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button type="button" class="btn btn-ghost modal-ask-btn" data-ask="${exp.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Ask SOMA</span>
            </button>
          </div>
        </div>
        <div class="gallery" data-count="${n}" data-orientation="${isLandscape ? 'landscape' : 'portrait'}" role="group" aria-label="${esc(exp.title)} photos">
          <div class="gallery-ambient" aria-hidden="true"></div>
          <div class="gallery-card-header">
            <span class="gallery-type-label"><span class="status-pulse" aria-hidden="true"></span> ${mediaBadgeText}</span>
            <span class="gallery-expand-hint">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              Click to zoom
            </span>
          </div>
          <div class="gallery-stage">
            <div class="gallery-track">${shots}</div>
            ${nav}
          </div>
          <div class="gallery-card-footer">
            <a class="gallery-drive-link" href="${esc(exp.mediaUrl)}" target="_blank" rel="noopener">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              <span>Live Setup &amp; Experience Videos on Drive</span>
            </a>
          </div>
        </div>
      </div>`;
  }

  const ExperienceModalController = {
    modal: $("expModal"),
    dialog: $("expModal") ? $("expModal").querySelector(".exp-modal-dialog") : null,
    body: $("expModalBody"),
    counter: $("expModalCounter"),
    prevBtn: $("expModalPrevBtn"),
    nextBtn: $("expModalNextBtn"),
    closeBtn: $("expModalCloseBtn"),
    currentIndex: 0,
    activeList: EXPERIENCES,
    lastOpener: null,

    init() {
      if (!this.modal) return;
      if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.close());
      if (this.prevBtn) this.prevBtn.addEventListener("click", () => this.prev());
      if (this.nextBtn) this.nextBtn.addEventListener("click", () => this.next());
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) this.close();
      });

      if (this.body) {
        this.body.addEventListener("click", (e) => {
        const enq = e.target.closest("[data-enquire]");
        if (enq) {
          const expId = enq.getAttribute("data-enquire");
          this.close(false);
          UnifiedEnquiryController.openModal("enquiry", expId, enq);
          return;
        }

        const ask = e.target.closest("[data-ask]");
        if (ask) {
          const exp = EXPERIENCES_BY_ID[ask.getAttribute("data-ask")];
          this.close(false);
          opensomaPanel();
          sendSomaMessage(`Tell me about the ${exp.name}`);
          return;
        }

        const shot = e.target.closest(".shot-btn");
        if (shot) {
          openLightbox(shot.getAttribute("data-exp"), +shot.getAttribute("data-i"), shot);
          return;
        }

        const gPrev = e.target.closest(".g-prev");
        const gNext = e.target.closest(".g-next");
        if (gPrev || gNext) {
          const gallery = e.target.closest(".gallery");
          const track = gallery ? gallery.querySelector(".gallery-track") : null;
          if (track) {
            const shift = track.clientWidth * 0.8;
            track.scrollBy({ left: gPrev ? -shift : shift, behavior: "smooth" });
          }
        }
      });
      }

      document.addEventListener("keydown", (e) => {
        if (!this.modal || this.modal.hidden) return;
        if (typeof lb !== "undefined" && lb && !lb.hidden) return;
        if (UnifiedEnquiryController.modal && !UnifiedEnquiryController.modal.hidden) return;

        if (e.key === "Escape") {
          this.close();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.prev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          this.next();
        }
      });
    },

    open(expId, opener = null) {
      this.activeList = EXPERIENCES;
      const idx = this.activeList.findIndex((x) => x.id === expId);
      this.currentIndex = idx >= 0 ? idx : 0;
      this.lastOpener = opener || document.activeElement;
      this.render();
      this.modal.hidden = false;
      document.body.classList.add("modal-open");
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      try { history.replaceState(null, "", `#exp-${this.activeList[this.currentIndex].id}`); } catch (err) {}
      this.closeBtn.focus();
    },

    render() {
      const exp = this.activeList[this.currentIndex];
      if (!exp) return;
      this.body.innerHTML = createShowcaseMarkup(exp);
      const total = this.activeList.length;
      const curNum = String(this.currentIndex + 1).padStart(2, "0");
      this.counter.textContent = `${curNum} / ${total}`;
      const prevExp = this.activeList[(this.currentIndex - 1 + total) % total];
      const nextExp = this.activeList[(this.currentIndex + 1) % total];
      this.prevBtn.title = `Previous: ${prevExp.name}`;
      this.nextBtn.title = `Next: ${nextExp.name}`;
      if (this.dialog) this.dialog.scrollTop = 0;
      if (this.body) this.body.scrollTop = 0;
      try { history.replaceState(null, "", `#exp-${exp.id}`); } catch (err) {}
    },

    next() {
      this.currentIndex = (this.currentIndex + 1) % this.activeList.length;
      this.render();
    },

    prev() {
      this.currentIndex = (this.currentIndex - 1 + this.activeList.length) % this.activeList.length;
      this.render();
    },

    close(restoreFocus = true) {
      if (!this.modal) return;
      this.modal.hidden = true;
      document.body.classList.remove("modal-open");
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (err) {}
      if (restoreFocus && this.lastOpener && typeof this.lastOpener.focus === "function") {
        this.lastOpener.focus();
      }
    }
  };

  function matches(exp) {
    if (state.category !== "All" && exp.category !== state.category) return false;
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    return [exp.title, exp.name, exp.category, exp.tagline, exp.description, ...exp.copy, ...(exp.tags || []), ...(exp.suitableFor || [])]
      .join(" ").toLowerCase().includes(q);
  }

  const ExperienceGridController = {
    init() {
      this.bindEvents();
      this.render();
    },

    bindEvents() {
      if (loadMoreBtn && !loadMoreBtn._bound) {
        loadMoreBtn._bound = true;
        loadMoreBtn.addEventListener("click", () => {
          state.visibleCount += BATCH_INCREMENT;
          this.render();
        });
      }
    },

    getFilteredList() {
      return EXPERIENCES.filter((exp) => matches(exp));
    },

    render() {
      const filtered = this.getFilteredList();
      const visible = filtered.slice(0, state.visibleCount);
      if (filtered.length === 0) {
        noResults.hidden = false;
        const qEsc = esc(state.query.trim());
        noResults.innerHTML = qEsc
          ? `No experiences match your search "${qEsc}". <button type="button" class="link-btn" id="askSomaNoResultsBtn">Ask SOMA AI ✦</button> or <button type="button" class="link-btn" id="resetFiltersBtn2">clear filters</button>.`
          : `No experiences match your selected filter. <button type="button" class="link-btn" id="resetFiltersBtn2">clear filters</button>.`;
        const askBtn = $("askSomaNoResultsBtn");
        if (askBtn) {
          askBtn.addEventListener("click", () => {
            if (typeof openSomaPanel === "function") openSomaPanel();
            if (typeof sendSomaMessage === "function") sendSomaMessage(state.query);
          });
        }
        const resetBtn2 = $("resetFiltersBtn2");
        if (resetBtn2) resetBtn2.addEventListener("click", resetFilters);
      } else {
        noResults.hidden = true;
      }
      gridFooter.hidden = filtered.length === 0;

      const filtering = state.category !== "All" || state.query.trim();
      resultsMeta.textContent = filtering
        ? `Showing ${visible.length} of ${filtered.length} matching experiences`
        : `${EXPERIENCES.length} experiences in catalogue`;

      gridShowingMeta.textContent = `Showing ${visible.length} of ${filtered.length} experiences`;
      loadMoreBtn.hidden = visible.length >= filtered.length;


      function getCardChips(exp) {
        const candidates = [];
        if (exp.features && exp.features.length) {
          for (const f of exp.features) {
            if (f && f.trim()) candidates.push(f.trim());
          }
        }
        if (exp.tags && exp.tags.length) {
          for (const t of exp.tags) {
            if (t && t.trim()) candidates.push(t.trim());
          }
        }
        const selected = [];
        for (const item of candidates) {
          if (selected.some((s) => s.toLowerCase() === item.toLowerCase())) continue;
          const formatted = item.length > 34 ? item.slice(0, 32).trim() + "…" : item;
          selected.push(formatted);
          if (selected.length === 3) break;
        }
        return selected;
      }

      gridEl.innerHTML = visible.map((exp) => {
        const coverImg = exp.images[0];
        const coverWebp = coverImg.replace(/\.(jpe?g|png)$/i, ".webp");
        const expIndexNum = String(Math.max(1, exp.pdfPage - 2)).padStart(2, "0");
        const chips = getCardChips(exp);
        const featureHtml = chips.map((f) => `<span class="exp-card-chip">✦ ${esc(f)}</span>`).join("");
        const taglineText = exp.tagline || (exp.description ? exp.description.slice(0, 85) + "…" : "");

        return `
          <article class="exp-card" data-id="${exp.id}" data-category="${esc(exp.category)}" tabindex="0" role="button" aria-label="View details for ${esc(exp.title)}">
            <div class="exp-card-media">
              <img class="exp-card-media-bg" src="${coverWebp}" alt="" aria-hidden="true" width="400" height="280" loading="lazy" decoding="async" onerror="this.src='${coverImg}'">
              <picture>
                <source srcset="${coverWebp}" type="image/webp">
                <img class="exp-card-media-main" src="${coverImg}" alt="${esc(exp.title)}" width="400" height="280" loading="lazy" decoding="async">
              </picture>
              <div class="exp-card-overlay">
                <span class="exp-card-badge">${esc(exp.category || "Experience")}</span>
                <span class="exp-card-num">Exp ${expIndexNum} / 44</span>
              </div>
            </div>
            <div class="exp-card-content">
              <h3 class="exp-card-title">${esc(exp.title)}</h3>
              <p class="exp-card-tagline">${esc(taglineText)}</p>
              <div class="exp-card-features">
                ${featureHtml}
              </div>
              <div class="exp-card-actions">
                <button type="button" class="btn btn-primary btn-sm exp-card-explore-btn" data-explore="${exp.id}">
                  <span>Explore</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
                <button type="button" class="btn btn-outline btn-sm" data-enquire="${exp.id}" aria-label="Request quote for ${esc(exp.title)}">
                  <span>Quote</span>
                </button>
              </div>
            </div>
          </article>
        `;
      }).join("");
    }
  };

  /* Document Event Delegation for Experiences Grid Cards & Actions */
  document.addEventListener("click", (e) => {
    const grid = e.target.closest("#experiencesGrid");
    if (!grid) return;

    const enq = e.target.closest("[data-enquire]");
    if (enq) {
      e.stopPropagation();
      UnifiedEnquiryController.openModal("quote", enq.getAttribute("data-enquire"), enq);
      return;
    }

    const expBtn = e.target.closest("[data-explore]");
    const card = e.target.closest(".exp-card");
    if (expBtn) {
      e.stopPropagation();
      ExperienceModalController.open(expBtn.getAttribute("data-explore"), expBtn);
      return;
    }
    if (card) {
      ExperienceModalController.open(card.getAttribute("data-id"), card);
    }
  });

  document.addEventListener("keydown", (e) => {
    const grid = e.target.closest("#experiencesGrid");
    if (!grid) return;
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".exp-card");
      if (card && e.target === card) {
        e.preventDefault();
        ExperienceModalController.open(card.getAttribute("data-id"), card);
      }
    }
  });

  function setupVoiceSearch() {
    if (!searchMicBtn || searchMicBtn._bound) return;
    searchMicBtn._bound = true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let voiceSearchRecognition = null;
    let isVoiceSearching = false;

    function stopVoiceSearch() {
      if (voiceSearchRecognition && isVoiceSearching) {
        try { voiceSearchRecognition.stop(); } catch (e) {}
      }
      isVoiceSearching = false;
      searchMicBtn.classList.remove("listening");
      searchMicBtn.setAttribute("title", "Search catalogue by voice");
      searchMicBtn.setAttribute("aria-label", "Search catalogue by voice");
      if (searchBox) searchBox.classList.remove("voice-listening");
      if (searchInput) searchInput.placeholder = "Search experiences...";
    }

    searchMicBtn.addEventListener("click", () => {
      if (isVoiceSearching) {
        stopVoiceSearch();
        return;
      }

      if (!SpeechRecognition) {
        alert("Speech recognition isn't supported in this browser. Please use Chrome, Edge, or Safari, or type your search query.");
        return;
      }

      try {
        voiceSearchRecognition = new SpeechRecognition();
        voiceSearchRecognition.lang = "en-US";
        voiceSearchRecognition.interimResults = true;
        voiceSearchRecognition.continuous = false;
        voiceSearchRecognition.maxAlternatives = 1;

        voiceSearchRecognition.onstart = () => {
          isVoiceSearching = true;
          searchMicBtn.classList.add("listening");
          searchMicBtn.setAttribute("title", "Listening... tap to stop");
          searchMicBtn.setAttribute("aria-label", "Listening... tap to stop");
          if (searchBox) searchBox.classList.add("voice-listening");
          if (searchInput) {
            searchInput.placeholder = "Listening... say 'wedding', 'robot', '360'...";
            searchInput.focus();
          }
        };

        voiceSearchRecognition.onresult = (event) => {
          let interim = "";
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += text;
            else interim += text;
          }

          const current = (final || interim).trim();
          if (current && searchInput) {
            searchInput.value = current;
            state.query = current;
            state.visibleCount = INITIAL_BATCH;
            if (searchBox) searchBox.classList.add("has-value");
            ExperienceGridController.render();
          }
        };

        voiceSearchRecognition.onerror = (event) => {
          stopVoiceSearch();
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            alert("Microphone permission was denied. Please allow microphone access in your browser to use voice search.");
          }
        };

        voiceSearchRecognition.onend = () => {
          stopVoiceSearch();
          const q = (searchInput && searchInput.value ? searchInput.value.trim() : "");
          if (!q) return;

          // If the query is an explicit question or if no catalogue experiences matched, offer SOMA
          const isQuestion = /^(what|how|why|tell me|who|where|recommend|can you|help|which|is there|explain)/i.test(q);
          const matchesCount = ExperienceGridController.getFilteredList().length;

          if (isQuestion || matchesCount === 0) {
            if (typeof openSomaPanel === "function") openSomaPanel();
            if (typeof sendSomaMessage === "function") sendSomaMessage(q);
          }
        };

        voiceSearchRecognition.start();
      } catch (err) {
        console.error("Voice search start error:", err);
        stopVoiceSearch();
      }
    });
  }

  function initExperiencesPage() {
    gridEl = $("experiencesGrid");
    gridFooter = $("gridFooter");
    gridShowingMeta = $("gridShowingMeta");
    loadMoreBtn = $("loadMoreBtn");
    chipsWrap = $("filterChips");
    searchInput = $("searchInput");
    searchBox = $("searchBox");
    clearSearchBtn = $("clearSearchBtn");
    searchMicBtn = $("searchMicBtn");
    resultsMeta = $("resultsMeta");
    noResults = $("noResults");
    resetFiltersBtn = $("resetFiltersBtn");

    if (!gridEl) return;

    if (chipsWrap && chipsWrap.children.length === 0) {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlQ = params.get("q");
        const urlCat = params.get("cat");
        if (urlQ) {
          state.query = urlQ;
          if (searchInput) searchInput.value = urlQ;
          if (searchBox) searchBox.classList.add("has-value");
        }
        if (urlCat && CATEGORIES.includes(urlCat)) {
          state.category = urlCat;
        }
      } catch (e) {}

      CATEGORIES.forEach((cat) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = cat;
        chip.setAttribute("aria-pressed", cat === state.category ? "true" : "false");
        chip.addEventListener("click", () => {
          state.category = cat;
          state.visibleCount = INITIAL_BATCH;
          syncChips();
          ExperienceGridController.render();
          try {
            chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          } catch (e) {}
        });
        chipsWrap.appendChild(chip);
      });

      if (!chipsWrap._wheelBound) {
        chipsWrap._wheelBound = true;
        chipsWrap.addEventListener("wheel", (e) => {
          if (e.deltaY && chipsWrap.scrollWidth > chipsWrap.clientWidth) {
            e.preventDefault();
            chipsWrap.scrollLeft += e.deltaY;
          }
        }, { passive: false });
      }
    }

    if (searchInput && !searchInput._bound) {
      searchInput._bound = true;
      let searchDebounceTimer = null;
      searchInput.addEventListener("input", () => {
        const val = searchInput.value;
        if (searchBox) searchBox.classList.toggle("has-value", !!val);
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          state.query = val;
          state.visibleCount = INITIAL_BATCH;
          ExperienceGridController.render();
        }, 110);
      });
    }

    if (clearSearchBtn && !clearSearchBtn._bound) {
      clearSearchBtn._bound = true;
      clearSearchBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        state.query = "";
        state.visibleCount = INITIAL_BATCH;
        if (searchBox) searchBox.classList.remove("has-value");
        ExperienceGridController.render();
        if (searchInput) searchInput.focus();
      });
    }

    if (resetFiltersBtn && !resetFiltersBtn._bound) {
      resetFiltersBtn._bound = true;
      resetFiltersBtn.addEventListener("click", resetFilters);
    }

    setupVoiceSearch();
    CategoryDrawerController.init();
    ExperienceGridController.init();
    syncChips();
  }

  /* Mobile Category Drawer Controller */
  const CategoryDrawerController = {
    drawer: null,
    dialog: null,
    trigger: null,
    closeBtn: null,
    handle: null,
    list: null,
    selectedLabel: null,
    countBadge: null,
    isOpen: false,

    init() {
      this.drawer = $("categoryDrawer");
      this.dialog = $("categorySheetDialog");
      this.trigger = $("categorySheetTrigger");
      this.closeBtn = $("categorySheetCloseBtn");
      this.handle = $("categorySheetHandle");
      this.list = $("categorySheetList");
      this.selectedLabel = $("categoryTriggerSelected");
      this.countBadge = $("categoryTriggerCount");

      if (!this.drawer || !this.trigger) return;

      this.populateList();
      this.bindEvents();
      this.sync();
    },

    populateList() {
      if (!this.list || this.list.children.length > 0) return;

      CATEGORIES.forEach((cat) => {
        const count = cat === "All"
          ? (typeof EXPERIENCES !== "undefined" ? EXPERIENCES.length : 44)
          : (typeof EXPERIENCES !== "undefined" ? EXPERIENCES.filter((e) => e.category === cat).length : 0);
        const displayLabel = cat === "All" ? "All Experiences" : cat;
        const isActive = cat === state.category;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `category-sheet-item${isActive ? " active" : ""}`;
        btn.setAttribute("data-category", cat);
        btn.setAttribute("role", "radio");
        btn.setAttribute("aria-checked", isActive ? "true" : "false");
        btn.innerHTML = `
          <span class="sheet-item-label-group">
            <span class="sheet-item-bullet" aria-hidden="true"></span>
            <span class="sheet-item-name">${esc(displayLabel)}</span>
          </span>
          <span class="sheet-item-meta">
            <span class="sheet-item-count">${count}</span>
            <span class="sheet-item-check" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          </span>
        `;

        btn.addEventListener("click", () => {
          state.category = cat;
          state.visibleCount = INITIAL_BATCH;
          syncChips();
          ExperienceGridController.render();
          this.close();
          if (this.trigger) this.trigger.focus();
        });

        this.list.appendChild(btn);
      });
    },

    bindEvents() {
      if (this.trigger && !this.trigger._bound) {
        this.trigger._bound = true;
        this.trigger.addEventListener("click", () => {
          if (this.isOpen) {
            this.close();
          } else {
            this.open();
          }
        });
      }

      if (this.closeBtn && !this.closeBtn._bound) {
        this.closeBtn._bound = true;
        this.closeBtn.addEventListener("click", () => this.close());
      }

      if (this.drawer && !this.drawer._bound) {
        this.drawer._bound = true;
        this.drawer.addEventListener("click", (e) => {
          if (e.target === this.drawer) {
            this.close();
          }
        });
      }

      if (!window._categoryDrawerKeyBound) {
        window._categoryDrawerKeyBound = true;
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && this.isOpen) {
            this.close();
            if (this.trigger) this.trigger.focus();
          }
        });
      }

      if (this.handle && !this.handle._bound) {
        this.handle._bound = true;
        let startY = 0;
        let currentY = 0;

        this.handle.addEventListener("touchstart", (e) => {
          startY = e.touches[0].clientY;
        }, { passive: true });

        this.handle.addEventListener("touchmove", (e) => {
          currentY = e.touches[0].clientY;
        }, { passive: true });

        this.handle.addEventListener("touchend", () => {
          if (currentY - startY > 40) {
            this.close();
          }
          startY = 0;
          currentY = 0;
        });
      }
    },

    open() {
      if (!this.drawer) return;
      this.isOpen = true;
      this.drawer.hidden = false;
      void this.drawer.offsetWidth;
      this.drawer.classList.add("open");
      if (this.trigger) this.trigger.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";

      const activeItem = this.list ? this.list.querySelector(".category-sheet-item.active") : null;
      if (activeItem) {
        setTimeout(() => activeItem.focus(), 80);
      } else if (this.closeBtn) {
        setTimeout(() => this.closeBtn.focus(), 80);
      }
    },

    close() {
      if (!this.drawer || !this.isOpen) return;
      this.isOpen = false;
      this.drawer.classList.remove("open");
      if (this.trigger) this.trigger.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      setTimeout(() => {
        if (!this.isOpen && this.drawer) {
          this.drawer.hidden = true;
        }
      }, 260);
    },

    sync() {
      const activeCount = state.category === "All"
        ? (typeof EXPERIENCES !== "undefined" ? EXPERIENCES.length : 44)
        : (typeof EXPERIENCES !== "undefined" ? EXPERIENCES.filter((e) => e.category === state.category).length : 0);

      if (this.selectedLabel) {
        this.selectedLabel.textContent = state.category === "All" ? "All Experiences" : state.category;
      }
      if (this.countBadge) {
        this.countBadge.textContent = activeCount;
      }
      if (this.trigger) {
        this.trigger.classList.toggle("has-filter", state.category !== "All");
      }

      if (this.list) {
        [...this.list.children].forEach((item) => {
          const cat = item.getAttribute("data-category");
          const isActive = cat === state.category;
          item.classList.toggle("active", isActive);
          item.setAttribute("aria-checked", isActive ? "true" : "false");
        });
      }
    }
  };

  function syncChips() {
    if (chipsWrap) {
      [...chipsWrap.children].forEach((chip) =>
        chip.setAttribute("aria-pressed", chip.textContent === state.category ? "true" : "false")
      );
    }
    CategoryDrawerController.sync();
  }

  function resetFilters() {
    state = { query: "", category: "All", visibleCount: INITIAL_BATCH };
    if (searchInput) searchInput.value = "";
    if (searchBox) searchBox.classList.remove("has-value");
    syncChips();
    if (gridEl) ExperienceGridController.render();
  }

  initExperiencesPage();

  if ($("expModal")) {
    ExperienceModalController.init();
  }

  /* ================================================================
     8. LIGHTBOX PHOTO VIEWER
     ================================================================ */
  const lb = $("lightbox"), lbImg = $("lbImg"), lbCap = $("lbCap");
  const lbPrev = $("lbPrev"), lbNext = $("lbNext"), lbClose = $("lbClose");
  let lbExp = null, lbIdx = 0, lbOpener = null;

  function showLightbox() {
    if (!lb || !lbExp) return;
    const n = lbExp.images.length;
    const orig = lbExp.images[lbIdx];
    const webp = orig.replace(/\.(jpe?g|png)$/i, ".webp");
    lbImg.src = webp;
    lbImg.onerror = () => { lbImg.src = orig; };
    lbImg.alt = `${lbExp.title} — photo ${lbIdx + 1} of ${n}`;
    lbCap.textContent = n > 1 ? `${lbExp.title} — ${lbIdx + 1} / ${n}` : lbExp.title;
    lbPrev.hidden = lbNext.hidden = n < 2;
  }

  function openLightbox(id, i, opener) {
    if (!lb) return;
    lbExp = EXPERIENCES_BY_ID[id];
    lbIdx = i;
    lbOpener = opener || null;
    showLightbox();
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    if (lbClose) lbClose.focus();
  }

  function closeLightbox() {
    if (!lb) return;
    lb.hidden = true;
    if (lbImg) lbImg.removeAttribute("src");
    if (ExperienceModalController.modal && !ExperienceModalController.modal.hidden) {
      document.body.style.overflow = "hidden";
      document.body.classList.add("modal-open");
    } else {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
    }
    if (lbOpener) lbOpener.focus();
  }

  const stepLb = (d) => {
    if (!lbExp) return;
    lbIdx = (lbIdx + d + lbExp.images.length) % lbExp.images.length;
    showLightbox();
  };

  if (lb && lbClose) {
    lbClose.addEventListener("click", closeLightbox);
    if (lbPrev) lbPrev.addEventListener("click", () => stepLb(-1));
    if (lbNext) lbNext.addEventListener("click", () => stepLb(1));
    lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });

    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft" && lbExp && lbExp.images.length > 1) stepLb(-1);
      else if (e.key === "ArrowRight" && lbExp && lbExp.images.length > 1) stepLb(1);
    });
  }

  /* ================================================================
     9. SOMA ACTION LAYER (Exposed to AI Agent)
     ================================================================ */
  function openExperience(id) {
    const exp = EXPERIENCES_BY_ID[id];
    if (!exp) return;
    if ($("expModal")) {
      ExperienceModalController.open(id);
    } else {
      window.location.href = `experiences.html#exp-${id}`;
    }
  }

  function filterExperiences(category) {
    if (!CATEGORIES.includes(category)) return;
    if (gridEl && chipsWrap) {
      state.category = category;
      state.visibleCount = INITIAL_BATCH;
      syncChips();
      ExperienceGridController.render();
      scrollToSection("experiences");
    } else {
      window.location.href = `experiences.html?cat=${encodeURIComponent(category)}`;
    }
  }

  function searchExperiences(query) {
    if (gridEl && searchInput) {
      state.query = query;
      state.category = "All";
      state.visibleCount = INITIAL_BATCH;
      searchInput.value = query;
      if (searchBox) searchBox.classList.toggle("has-value", !!query);
      syncChips();
      ExperienceGridController.render();
      scrollToSection("experiences");
    } else {
      window.location.href = `experiences.html?q=${encodeURIComponent(query)}`;
    }
  }

  function scrollToSection(id) {
    const el = $(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openContactForm(quote = false) {
    UnifiedEnquiryController.openModal(quote ? "quote" : "enquiry");
  }

  function startQuoteRequest() {
    UnifiedEnquiryController.openModal("quote");
  }

  window.SnapAssureUI = {
    openExperience,
    filterExperiences,
    searchExperiences,
    scrollToSection,
    openContactForm,
    startQuoteRequest
  };

  if (location.hash.startsWith("#exp-")) {
    const id = location.hash.slice(5);
    if (EXPERIENCES_BY_ID[id]) setTimeout(() => openExperience(id), 250);
  }

  /* ================================================================
     10. SOMA CHAT PANEL & ASSISTANT STATES
     ================================================================ */
  const somaLauncher = $("somaLauncher");
  const somaPanel = $("somaPanel");
  const navSomaBtn = $("navSomaBtn");
  const heroChatBtn = $("heroChatBtn");
  const somaMinimizeBtn = $("somaMinimizeBtn");
  const somaClearBtn = $("somaClearBtn");
  const somaInfoBtn = $("somaInfoBtn");
  const somaInfoBackBtn = $("somaInfoBackBtn");
  const somaInfoView = $("somaInfoView");
  const somaMessages = $("somaMessages");
  const somaTextInput = $("somaTextInput");
  const somaSendBtn = $("somaSendBtn");
  const somaMicBtn = $("somaMicBtn");
  const somaStopSpeakBtn = $("somaStopSpeakBtn");
  const somaErrorBanner = $("somaErrorBanner");
  const somaStatusBadge = $("somaStatusBadge");
  const somaStatusText = $("somaStatusText");

  if (typeof SomaMemory !== "undefined" && SomaMemory.load) {
    SomaMemory.load();
  }

  function setSomaState(stateName) {
    const s = stateName.toLowerCase();
    if (somaStatusBadge) somaStatusBadge.className = `soma-status-badge ${s}`;
    if (somaStatusText) somaStatusText.textContent = stateName.toUpperCase();
  }

  function openSomaPanel(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const panel = $("somaPanel") || document.getElementById("somaPanel");
    const launcher = $("somaLauncher") || document.getElementById("somaLauncher");
    if (!panel) return;
    panel.classList.add("open");
    panel.style.display = "flex";
    if (launcher) launcher.classList.add("hidden");
    try {
      const msgs = $("somaMessages") || document.getElementById("somaMessages");
      if (msgs && !msgs.children.length) renderGreeting();
    } catch (err) {
      console.warn("[SOMA] Error rendering greeting:", err);
    }
    const input = $("somaTextInput") || document.getElementById("somaTextInput");
    if (input) {
      setTimeout(() => input.focus(), 60);
    }
    setSomaState("idle");
  }

  function closeSomaPanel(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const panel = $("somaPanel") || document.getElementById("somaPanel");
    const launcher = $("somaLauncher") || document.getElementById("somaLauncher");
    if (!panel) return;
    panel.classList.remove("open");
    panel.style.display = "";
    if (launcher) launcher.classList.remove("hidden");
    if (typeof VoiceAgent !== "undefined" && VoiceAgent.stopSpeaking) {
      VoiceAgent.stopSpeaking();
    }
    setSomaState("idle");
  }

  // Support both namings across codebase
  const opensomaPanel = openSomaPanel;
  const closesomaPanel = closeSomaPanel;
  window.openSomaPanel = openSomaPanel;
  window.closeSomaPanel = closeSomaPanel;
  window.opensomaPanel = openSomaPanel;
  window.closesomaPanel = closeSomaPanel;

  if (somaLauncher) somaLauncher.addEventListener("click", openSomaPanel);
  if (navSomaBtn) navSomaBtn.addEventListener("click", openSomaPanel);
  if (heroChatBtn) heroChatBtn.addEventListener("click", openSomaPanel);
  if (somaMinimizeBtn) somaMinimizeBtn.addEventListener("click", closeSomaPanel);

  // Global click delegation ensures SOMA triggers work even after page transitions
  document.addEventListener("click", (e) => {
    const somaTrigger = e.target.closest("#somaLauncher, #navSomaBtn, #heroChatBtn, .hero-chat-cta, .soma-nav-btn, [data-open-soma]");
    if (somaTrigger) {
      e.preventDefault();
      openSomaPanel(e);
      return;
    }
    const somaClose = e.target.closest("#somaMinimizeBtn");
    if (somaClose) {
      e.preventDefault();
      closeSomaPanel(e);
      return;
    }
  });

  document.addEventListener("keydown", (e) => {
    const panel = $("somaPanel") || document.getElementById("somaPanel");
    if (e.key === "Escape" && panel && panel.classList.contains("open")) {
      closeSomaPanel();
    }
  });

  if (somaClearBtn) {
    somaClearBtn.addEventListener("click", () => {
      if (typeof SomaMemory !== "undefined" && SomaMemory.clear) SomaMemory.clear();
      if (somaMessages) somaMessages.innerHTML = "";
      if (somaTextInput) {
        somaTextInput.value = "";
        somaTextInput.style.height = "auto";
        somaTextInput.style.overflowY = "hidden";
      }
      renderGreeting();
      setSomaState("idle");
    });
  }

  if (somaInfoBtn) {
    somaInfoBtn.addEventListener("click", () => {
      if (somaMessages) somaMessages.hidden = true;
      const inputRow = document.querySelector(".soma-input-row");
      if (inputRow) inputRow.hidden = true;
      if (somaInfoView) somaInfoView.hidden = false;
    });
  }

  if (somaInfoBackBtn) {
    somaInfoBackBtn.addEventListener("click", () => {
      if (somaInfoView) somaInfoView.hidden = true;
      if (somaMessages) somaMessages.hidden = false;
      const inputRow = document.querySelector(".soma-input-row");
      if (inputRow) inputRow.hidden = false;
    });
  }

  function showError(message) {
    somaErrorBanner.textContent = message;
    somaErrorBanner.classList.add("show");
    setTimeout(() => somaErrorBanner.classList.remove("show"), 5000);
  }

  function formatSomaMarkdown(text) {
    if (!text) return "";
    let safe = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks ```code```
    safe = safe.replace(/```([\s\S]*?)```/g, "<pre class='code-block'><code>$1</code></pre>");

    // Inline code `code`
    safe = safe.replace(/`([^`]+)`/g, "<code class='inline-code'>$1</code>");

    // Bold **text**
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/__([^_]+)__/g, "<strong>$1</strong>");

    // Italic *text*
    safe = safe.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    return safe;
  }

  function appendMessage(role, text, relatedIds = []) {
    const wrap = document.createElement("div");
    wrap.className = `msg msg-${role}`;
    wrap.innerHTML = formatSomaMarkdown(text);
    somaMessages.appendChild(wrap);

    if (role === "soma" && relatedIds.length) {
      const chipsRow = document.createElement("div");
      chipsRow.className = "msg-suggestions";
      relatedIds.slice(0, 4).forEach((id) => {
        const exp = EXPERIENCES_BY_ID[id];
        if (!exp) return;
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "suggestion-chip";
        chip.textContent = exp.name;
        chip.addEventListener("click", () => openExperience(id));
        chipsRow.appendChild(chip);
      });
      somaMessages.appendChild(chipsRow);
    }
    somaMessages.scrollTop = somaMessages.scrollHeight;
  }

  function appendSuggestedPrompts() {
    const msgs = $("somaMessages") || document.getElementById("somaMessages");
    if (!msgs) return;
    const prompts = (typeof window !== "undefined" && window.SOMA_SUGGESTED_PROMPTS) ||
      (typeof SOMA_SUGGESTED_PROMPTS !== "undefined" ? SOMA_SUGGESTED_PROMPTS : [
        "Show me wedding experiences",
        "What is your AI photobooth?",
        "Which booths work for corporate events?",
        "Tell me about the 360 Video Booth",
        "Help me choose an experience"
      ]);
    const chipsRow = document.createElement("div");
    chipsRow.className = "msg-suggestions";
    prompts.forEach((prompt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "suggestion-chip";
      chip.textContent = prompt;
      chip.addEventListener("click", () => sendSomaMessage(prompt));
      chipsRow.appendChild(chip);
    });
    msgs.appendChild(chipsRow);
  }

  function renderGreeting() {
    const greetingText = (typeof window !== "undefined" && window.SOMA_GREETING) ||
      (typeof SOMA_GREETING !== "undefined" ? SOMA_GREETING : "Hi, I'm SOMA — SnapAssure's AI assistant. Tell me about your event, and I'll help you discover the right experience.");
    appendMessage("soma", greetingText);
    appendSuggestedPrompts();
  }

  function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "msg msg-soma";
    wrap.id = "typingIndicator";
    wrap.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
    somaMessages.appendChild(wrap);
    somaMessages.scrollTop = somaMessages.scrollHeight;
  }

  function hideTyping() {
    document.getElementById("typingIndicator")?.remove();
  }

  async function sendSomaMessage(text, { fromVoice = false } = {}) {
    if (!text || !text.trim()) return;
    appendMessage("user", text);
    SomaMemory.push("user", text);
    showTyping();
    setSomaState("thinking");

    try {
      const { reply, action } = await callAIBackend(text, SomaMemory);
      hideTyping();

      const isBoothRelated = Boolean(action?.experienceId || action?.category || /\b(booth|photobooth|photo|video|glambot|roamer|camera|print|prints|wedding|party|corporate|activation|experience|snapassure|package|quote)\b/i.test(text + " " + reply));
      const related = isBoothRelated
        ? retrieveExperiences(text, { limit: 4 }).map((e) => e.id)
        : [];
      appendMessage("soma", reply, related);
      SomaMemory.push("soma", reply);

      executeSomaAction(action);

      // If AI wants to switch user to chat (e.g. user asked "go to chat")
      if (action?.type === "switchToChat") {
        VoiceUIController.switchToChat();
        return;
      }

      if (fromVoice) {
        VoiceUIController.speakReply(reply);
      } else {
        setSomaState("idle");
      }
    } catch (err) {
      hideTyping();
      const msg = "SOMA's AI service is temporarily unavailable. You can keep browsing the catalogue or reach us directly at +91 9601514454.";
      appendMessage("soma", msg);
      showError(msg);
      setSomaState("idle");
      if (fromVoice) VoiceUIController.speakReply(msg);
    }
  }

  window.sendSomaMessage = sendSomaMessage;

  function adjustSomaInputHeight() {
    if (!somaTextInput) return;
    somaTextInput.style.height = "auto";
    const maxHeight = 120;
    const scrollH = somaTextInput.scrollHeight;
    if (scrollH > maxHeight) {
      somaTextInput.style.height = maxHeight + "px";
      somaTextInput.style.overflowY = "auto";
    } else {
      somaTextInput.style.height = Math.max(scrollH, 42) + "px";
      somaTextInput.style.overflowY = "hidden";
    }
  }

  if (somaSendBtn) {
    somaSendBtn.addEventListener("click", () => {
      if (!somaTextInput) return;
      const text = somaTextInput.value;
      somaTextInput.value = "";
      somaTextInput.style.height = "auto";
      somaTextInput.style.overflowY = "hidden";
      sendSomaMessage(text);
    });
  }

  if (somaTextInput) {
    somaTextInput.style.overflowY = "hidden";
    somaTextInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (somaSendBtn) somaSendBtn.click();
      }
    });

    somaTextInput.addEventListener("input", adjustSomaInputHeight);
  }

  if (somaStopSpeakBtn) {
    somaStopSpeakBtn.addEventListener("click", () => {
      if (typeof VoiceAgent !== "undefined" && VoiceAgent.stopSpeaking) {
        VoiceAgent.stopSpeaking();
      }
      somaStopSpeakBtn.hidden = true;
      setSomaState("idle");
    });
  }

  /* ================================================================
     11. VOICE UI CONTROLLER (Overlay + Mic in Chat)
     ================================================================ */
  const voiceOverlay = $("voiceOverlay");
  const voiceOrb = $("voiceOrb");
  const voiceStateLabel = $("voiceStateLabel");
  const voiceTranscript = $("voiceTranscript");
  const voiceFallbackNote = $("voiceFallbackNote");
  const voiceCloseBtn = $("voiceCloseBtn");
  const heroVoiceBtn = $("heroVoiceBtn");

  const VoiceUIController = (() => {
    function setState(newState, label) {
      voiceOrb.classList.remove("listening", "thinking", "speaking");
      if (newState) {
        voiceOrb.classList.add(newState);
        setSomaState(newState);
      } else {
        setSomaState("idle");
      }
      voiceStateLabel.textContent = label;
    }

    function open() {
      voiceOverlay.classList.add("open");
      if (!VoiceAgent.supportsRecognition) {
        voiceFallbackNote.hidden = false;
        voiceFallbackNote.textContent = "Voice input isn't supported in this browser. Try Chrome or Edge on desktop/Android, or chat using text.";
        setState(null, "Voice unavailable");
        return;
      }
      voiceFallbackNote.hidden = true;
      startTurn();
    }

    function close() {
      VoiceAgent.stopListening();
      VoiceAgent.stopSpeaking();
      voiceOverlay.classList.remove("open");
      somaStopSpeakBtn.hidden = true;
      somaMicBtn.classList.remove("listening");
      setSomaState("idle");
    }

    function startTurn() {
      voiceTranscript.textContent = "";
      setState("listening", "Listening…");
      VoiceAgent.startListening({
        onInterim: (text) => { voiceTranscript.textContent = text; },
        onEnd: (finalText) => {
          if (!finalText) {
            setState(null, "Say something…");
            return;
          }
          setState("thinking", "Thinking…");

          // Detect "go to chat" / "switch to chat" intent instantly
          const wantsChat = /\b(go to chat|switch to chat|use chat|open chat|chat mode|text mode|use text|i want to type|let me type|typing)\b/i.test(finalText);
          if (wantsChat) {
            setState("speaking", "Switching to chat…");
            VoiceAgent.speak("Sure! Opening the chat for you now.", {
              onEnd: () => {
                close();
                openSomaPanel();
              },
              onError: () => {
                close();
                openSomaPanel();
              }
            });
          } else {
            sendSomaMessage(finalText, { fromVoice: true });
          }
        },
        onError: (err) => {
          setState(null, "Say something…");
          voiceFallbackNote.hidden = false;
          voiceFallbackNote.textContent = err.message;
          showError(err.message);
          setSomaState("idle");
        }
      });
    }

    // Strip markdown so TTS speaks clean text (no "asterisk asterisk" etc.)
    function stripMarkdown(text) {
      return text
        .replace(/```[\s\S]*?```/g, "")          // remove code blocks entirely
        .replace(/`([^`]+)`/g, "$1")              // inline code → plain text
        .replace(/\*\*\*(.+?)\*\*\*/g, "$1")     // bold+italic → plain
        .replace(/\*\*(.+?)\*\*/g, "$1")         // **bold** → plain
        .replace(/\*(.+?)\*/g, "$1")             // *italic* → plain
        .replace(/#{1,6}\s+/g, "")               // ## headings → remove hashes
        .replace(/^\s*[-*+]\s+/gm, "")           // bullet points → remove dash
        .replace(/^\s*\d+\.\s+/gm, "")           // numbered lists → remove number
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → just text
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")  // images → remove
        .replace(/_{1,2}(.+?)_{1,2}/g, "$1")     // _italic_ / __bold__ → plain
        .replace(/~~(.+?)~~/g, "$1")             // ~~strikethrough~~ → plain
        .replace(/\n{2,}/g, ". ")                // double newlines → pause
        .replace(/\n/g, " ")                     // single newlines → space
        .trim();
    }

    function speakReply(text) {
      setState("speaking", "SOMA is responding…");
      somaStopSpeakBtn.hidden = false;
      VoiceAgent.speak(stripMarkdown(text), {
        onEnd: () => {
          somaStopSpeakBtn.hidden = true;
          setSomaState("idle");
          // Auto-restart listening to keep the voice conversation going
          if (voiceOverlay.classList.contains("open")) {
            setTimeout(() => startTurn(), 400); // small pause before re-listening
          }
        },
        onError: (err) => {
          somaStopSpeakBtn.hidden = true;
          showError(err.message);
          setSomaState("idle");
          if (voiceOverlay.classList.contains("open")) close();
        }
      });
    }

    // Expose switchToChat so AI reply can also trigger it
    function switchToChat() {
      close();
      openSomaPanel();
    }

    return { open, close, speakReply, switchToChat };
  })();

  if (heroVoiceBtn) heroVoiceBtn.addEventListener("click", VoiceUIController.open);
  document.querySelectorAll(".hero-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-soma-prompt");
      openSomaPanel();
      sendSomaMessage(prompt);
    });
  });
  if (somaMicBtn) {
    somaMicBtn.addEventListener("click", () => {
      somaMicBtn.classList.add("listening");
      VoiceUIController.open();
    });
  }
  if (voiceCloseBtn) {
    voiceCloseBtn.addEventListener("click", () => {
      VoiceUIController.close();
      if (somaMicBtn) somaMicBtn.classList.remove("listening");
    });
  }
  if (voiceOrb) {
    voiceOrb.addEventListener("click", () => VoiceUIController.close());
  }

  document.addEventListener("keydown", (e) => {
    if (voiceOverlay && voiceOverlay.classList.contains("open")) {
      if (e.key === "Escape") {
        e.preventDefault();
        VoiceUIController.close();
      } else if (e.code === "Space" && document.activeElement === document.body) {
        e.preventDefault();
        VoiceUIController.close();
      }
    }
  });

  // Open experience modal if URL has hash (e.g. #exp-snap-rover)
  if (location.hash && location.hash.startsWith("#exp-")) {
    const hashId = location.hash.replace("#exp-", "");
    if (EXPERIENCES_BY_ID[hashId]) {
      setTimeout(() => ExperienceModalController.open(hashId), 250);
    }
  }
});
