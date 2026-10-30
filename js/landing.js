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
