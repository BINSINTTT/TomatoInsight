(function () {
  function initAuthSlideshow() {
    const root = document.getElementById("auth-slideshow");
    if (!root || root.dataset.ready === "true") return;
    root.dataset.ready = "true";

    const slides = Array.from(root.querySelectorAll("[data-slideshow-slide]"));
    const dotsWrap = root.querySelector("[data-slideshow-dots]");
    const prevBtn = root.querySelector("[data-slideshow-prev]");
    const nextBtn = root.querySelector("[data-slideshow-next]");
    if (slides.length < 2) return;

    let index = Math.max(
      0,
      slides.findIndex((slide) => slide.classList.contains("is-active"))
    );
    let timer = null;
    const AUTO_MS = 6000;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function goTo(nextIndex) {
      const total = slides.length;
      index = ((nextIndex % total) + total) % total;
      slides.forEach((slide, i) => {
        const active = i === index;
        slide.classList.toggle("is-active", active);
        slide.setAttribute("aria-hidden", active ? "false" : "true");
      });
      if (dotsWrap) {
        Array.from(dotsWrap.children).forEach((dot, i) => {
          const active = i === index;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-selected", active ? "true" : "false");
          dot.setAttribute("tabindex", active ? "0" : "-1");
        });
      }
      restartTimer();
    }

    function restartTimer() {
      if (timer) window.clearInterval(timer);
      timer = null;
      if (reduceMotion) return;
      timer = window.setInterval(() => goTo(index + 1), AUTO_MS);
    }

    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      slides.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "auth-slideshow__dot" + (i === index ? " is-active" : "");
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", `Show slide ${i + 1}`);
        dot.setAttribute("aria-selected", i === index ? "true" : "false");
        dot.setAttribute("tabindex", i === index ? "0" : "-1");
        dot.addEventListener("click", () => goTo(i));
        dotsWrap.appendChild(dot);
      });
    }

    prevBtn?.addEventListener("click", () => goTo(index - 1));
    nextBtn?.addEventListener("click", () => goTo(index + 1));

    root.addEventListener("mouseenter", () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    });
    root.addEventListener("mouseleave", restartTimer);
    root.addEventListener("focusin", () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    });
    root.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget)) restartTimer();
    });

    goTo(index);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthSlideshow);
  } else {
    initAuthSlideshow();
  }
})();
