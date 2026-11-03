/* Landing page behaviour (Bootstrap + Hopewell theme).
   Only used by html/landing.html; every lookup is optional so a missing
   section or a blocked CDN never breaks the rest of the page. */
(function () {
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function initReveal() {
    if (typeof window.AOS === "undefined") return;
    window.AOS.init({ duration: 800, easing: "ease-out-cubic", once: true, offset: 80 });
  }

  function initPreloader() {
    const preloader = document.getElementById("preloader");
    if (!preloader) return;

    const hide = () => preloader.classList.add("hide");
    window.addEventListener("load", () => setTimeout(hide, 300), { once: true });
    // Fallback for a slow or already-fired load event.
    setTimeout(hide, 2500);
  }

  function initNavbar() {
    const nav = document.getElementById("mainNav");
    const scrollTopBtn = document.getElementById("scrollTop");
    const ring = scrollTopBtn && scrollTopBtn.querySelector(".progress");

    if (ring) {
      const circumference = 2 * Math.PI * 23;
      ring.style.strokeDasharray = String(circumference);
      ring.style.strokeDashoffset = String(circumference);

      const setProgress = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
        ring.style.strokeDashoffset = String(circumference - ratio * circumference);
      };

      const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
      scrollTopBtn.addEventListener("click", toTop);
      scrollTopBtn.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toTop();
        }
      });

      window.addEventListener(
        "scroll",
        () => {
          setProgress();
          scrollTopBtn.classList.toggle("show", window.scrollY > 400);
        },
        { passive: true }
      );
      setProgress();
    }

    if (nav) {
      const setNavState = () => nav.classList.toggle("scrolled", window.scrollY > 40);
      window.addEventListener("scroll", setNavState, { passive: true });
      setNavState();
    }

    // Close the mobile menu once a section link is followed.
    const menu = document.getElementById("navMenu");
    if (!menu || typeof window.bootstrap === "undefined") return;
    menu.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        window.bootstrap.Collapse.getInstance(menu)?.hide();
      });
    });
  }

  /* Runs `reveal` once per element, the first time it scrolls into view. */
  function whenVisible(elements, reveal, threshold) {
    if (!elements.length) return;

    if (!("IntersectionObserver" in window)) {
      elements.forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          reveal(entry.target);
        });
      },
      { threshold: threshold }
    );
    elements.forEach((el) => observer.observe(el));
  }

  function initCounters() {
    const counters = Array.from(document.querySelectorAll(".counter"));

    whenVisible(
      counters,
      (el) => {
        const target = parseInt(el.getAttribute("data-target"), 10);
        if (Number.isNaN(target)) return;

        const duration = 1600;
        let startTime = null;

        const step = (timestamp) => {
          if (startTime === null) startTime = timestamp;
          const progress = Math.min((timestamp - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.floor(eased * target).toLocaleString();
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target.toLocaleString();
        };

        requestAnimationFrame(step);
      },
      0.5
    );
  }

  function initFlashcards() {
    document.querySelectorAll(".ti-flashcards").forEach(setupFlashcards);
    initHowGlassCards();
  }

  function initHowGlassCards() {
    const root = document.querySelector("[data-how-glass]");
    if (!root) return;

    const slots = Array.from(root.querySelectorAll("[data-glass-slot]"));
    const dotsWrap = root.querySelector(".hiw-glass__dots");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const slides = [
      {
        src: "../img/how-works-00-add-blueprint.png",
        label: "Add",
        alt: "Empty farm blueprint with add button to set rows and columns",
      },
      {
        src: "../img/how-works-01-layout.png",
        label: "Layout",
        alt: "Farm layout setup with rows and columns preview",
      },
      {
        src: "../img/how-works-02-blueprint.png",
        label: "Blueprint",
        alt: "Farm blueprint grid with plant tiles ready to scan",
      },
      {
        src: "../img/how-works-03-upload.png",
        label: "Upload",
        alt: "Tile drawer open to upload a tomato leaf photo",
      },
      {
        src: "../img/how-works-04-scanning.png",
        label: "Scan",
        alt: "Leaf photo being analyzed in the scan panel",
      },
      {
        src: "../img/how-works-05-result.png",
        label: "Result",
        alt: "Disease classification result with TLCV at 100 percent",
      },
      {
        src: "../img/how-works-06-care.png",
        label: "Care",
        alt: "Care recommendations and treatment steps after a scan",
      },
    ];
    if (!slots.length || slides.length < 3) return;

    let index = 0;
    let hoverTimer = null;
    let isHovering = false;
    let switching = false;
    const HOVER_ADVANCE_MS = 2800;
    const SLIDE_MS = 680;
    const fan = root.querySelector(".hiw-glass__fan");
    if (!fan) return;

    let track = fan.querySelector(".hiw-glass__track");
    if (!track) {
      track = document.createElement("div");
      track.className = "hiw-glass__track";
      while (fan.firstChild) track.appendChild(fan.firstChild);
      fan.appendChild(track);
    }

    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      slides.forEach((slide, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "hiw-glass__dot";
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", slide.label);
        dot.addEventListener("click", () => {
          if (i === index || switching) return;
          goTo(i, true);
          if (isHovering) scheduleAdvance();
        });
        dotsWrap.appendChild(dot);
      });
    }
    const dots = Array.from(root.querySelectorAll(".hiw-glass__dot"));

    function normalize(i) {
      return ((i % slides.length) + slides.length) % slides.length;
    }

    function applySlides() {
      slots.forEach((slot, slotIndex) => {
        const slide = slides[(index + slotIndex) % slides.length];
        const img = slot.querySelector("img");
        slot.setAttribute("data-text", slide.label);
        if (img) {
          img.src = slide.src;
          img.alt = slide.alt;
        }
      });
      dots.forEach((dot, i) => {
        const active = i === index;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    function wait(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function preload(src) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      });
    }

    function fillCard(card, slide) {
      card.setAttribute("data-text", slide.label);
      const img = card.querySelector("img");
      if (img) {
        img.src = slide.src;
        img.alt = slide.alt;
      }
    }

    function cardStep() {
      const a = slots[0].getBoundingClientRect();
      const b = slots[1].getBoundingClientRect();
      return Math.abs(b.left - a.left) || a.width;
    }

    function resetTrackTransform() {
      track.style.transition = "none";
      track.style.transform = "";
      track.style.marginLeft = "";
      void track.offsetWidth;
      track.style.transition = "";
    }

    async function slideByOne(direction) {
      const forward = direction > 0;
      const incomingSlide = forward
        ? slides[(index + 3) % slides.length]
        : slides[normalize(index - 1)];
      await preload(incomingSlide.src);

      const incoming = slots[0].cloneNode(true);
      incoming.classList.remove("is-exit");
      incoming.removeAttribute("data-glass-slot");
      incoming.setAttribute("data-incoming", "");
      incoming.style.setProperty("--r", forward ? "25" : "-15");
      fillCard(incoming, incomingSlide);

      // Keep cards visually centered while locking a left-aligned track for the slide.
      const inset = slots[0].getBoundingClientRect().left - fan.getBoundingClientRect().left;
      root.classList.add("is-sliding");
      track.style.marginLeft = `${Math.max(0, inset)}px`;
      void track.offsetWidth;

      const step = cardStep();
      const exitCard = forward ? slots[0] : slots[slots.length - 1];

      if (forward) track.appendChild(incoming);
      else track.insertBefore(incoming, slots[0]);

      track.style.transition = "none";
      track.style.transform = forward ? "translateX(0)" : `translateX(-${step}px)`;
      void track.offsetWidth;

      track.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      exitCard.classList.add("is-exit");
      track.style.transform = forward ? `translateX(-${step}px)` : "translateX(0)";

      await wait(SLIDE_MS);

      index = normalize(index + direction);
      applySlides();
      incoming.remove();
      exitCard.classList.remove("is-exit");
      resetTrackTransform();
      root.classList.remove("is-sliding");
    }

    async function goTo(nextIndex, animate) {
      if (switching) return;
      const target = normalize(nextIndex);
      if (target === index) return;

      if (!animate || reduceMotion) {
        index = target;
        applySlides();
        return;
      }

      switching = true;
      try {
        const forwardDist = normalize(target - index);
        const backwardDist = normalize(index - target);
        const direction = forwardDist <= backwardDist ? 1 : -1;
        let steps = Math.min(forwardDist, backwardDist);
        if (steps === 0) steps = forwardDist;
        while (steps > 0) {
          await slideByOne(direction);
          steps -= 1;
        }
      } finally {
        switching = false;
      }
    }

    function clearAdvance() {
      if (hoverTimer) window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }

    function scheduleAdvance() {
      clearAdvance();
      if (reduceMotion || !isHovering) return;
      hoverTimer = window.setTimeout(async () => {
        await goTo(index + 1, true);
        scheduleAdvance();
      }, HOVER_ADVANCE_MS);
    }

    root.addEventListener("mouseenter", () => {
      isHovering = true;
      root.classList.add("is-open");
      scheduleAdvance();
    });
    root.addEventListener("mouseleave", () => {
      isHovering = false;
      root.classList.remove("is-open");
      clearAdvance();
    });
    root.addEventListener("focusin", () => {
      isHovering = true;
      root.classList.add("is-open");
      scheduleAdvance();
    });
    root.addEventListener("focusout", (event) => {
      if (root.contains(event.relatedTarget)) return;
      isHovering = false;
      root.classList.remove("is-open");
      clearAdvance();
    });

    applySlides();
  }

  function setupFlashcards(root) {
    const cards = Array.from(root.querySelectorAll(".ti-flashcard"));
    const dots = Array.from(root.querySelectorAll("[data-flash-dot]"));
    if (!cards.length) return;

    let index = 0;
    let timer = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function render() {
      cards.forEach((card, i) => {
        const offset = (i - index + cards.length) % cards.length;
        card.dataset.offset = offset > 2 ? "hide" : String(offset);
        card.setAttribute("aria-hidden", offset === 0 ? "false" : "true");
      });
      dots.forEach((dot, i) => {
        const active = i === index;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    function go(next) {
      index = (next + cards.length) % cards.length;
      render();
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    function start() {
      if (reduceMotion) return;
      stop();
      timer = setInterval(() => go(index + 1), 3800);
    }

    root.querySelector("[data-flash-next]")?.addEventListener("click", () => {
      go(index + 1);
      start();
    });
    root.querySelector("[data-flash-prev]")?.addEventListener("click", () => {
      go(index - 1);
      start();
    });
    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        go(i);
        start();
      });
    });
    cards.forEach((card) => {
      card.addEventListener("click", () => {
        if (card.dataset.offset !== "0") return;
        go(index + 1);
        start();
      });
    });
    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget)) start();
    });

    render();
    start();
  }

  function initScanMock() {
    const fills = Array.from(document.querySelectorAll(".ti-bar__fill"));

    whenVisible(
      fills,
      (el) => {
        el.style.width = el.getAttribute("data-fill") + "%";
      },
      0.3
    );
  }

  function initHeroGlow() {
    const hero = document.querySelector(".hero");
    const glow = document.querySelector(".hero-glow");
    if (!hero || !glow || !window.matchMedia("(pointer: fine)").matches) return;

    hero.addEventListener("mousemove", (event) => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left - 260) * 0.15;
      const y = (event.clientY - rect.top - 260) * 0.15;
      glow.style.transform = "translate(" + x + "px," + y + "px)";
    });
  }

  onReady(function () {
    initReveal();
    initPreloader();
    initNavbar();
    initCounters();
    initFlashcards();
    initScanMock();
    initHeroGlow();
  });
})();
