/**
 * SAMARTHA 2026 // 24-HOUR HACKATHON
 * Department of Computer Science & Engineering, VIIT
 * Doomsday / Doctor Doom Emerald Theme - Interactive Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. INITIALIZE WEB AUDIO SYNTHESIZER
  const audioSystem = initTacticalAudio();

  // 2. INITIALIZE FALLOUT PARTICLE CANVAS (EMERALD PARTICLES)
  initFalloutCanvas();

  // 3. INITIALIZE COUNTDOWN CLOCK (TO EVENT DATE: OCTOBER 10, 2026)
  initCountdownTimer();

  // 4. INITIALIZE POSTER LIGHTBOX & QR CODE MODAL
  initPosterLightbox(audioSystem);

  // 5. INITIALIZE SCHEDULE STAGE TABS
  initScheduleTabs(audioSystem);

  // 6. INITIALIZE WAR ROOM OPERATIONS DASHBOARD
  initWarRoomDashboard(audioSystem);

  // 7. INITIALIZE FAQ ACCORDION & MOBILE NAVIGATION
  initFaqAccordion(audioSystem);
  initMobileNavigation();

  // 8. GLOBAL BUTTON AUDIO FEEDBACK
  attachGlobalAudioClicks(audioSystem);

  // 9. GATEWAY PORTAL ("ENTER THE WORLD")
  initGatewayPortal(audioSystem);
});

/* ==========================================================================
   1. TACTICAL WEB AUDIO SYNTHESIZER
   ========================================================================== */
function initTacticalAudio() {
  let audioCtx = null;
  let isMuted = false;

  function getContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTerminalBeep(freq = 880, type = 'sine', duration = 0.06, gainVol = 0.05) {
    if (isMuted) return;
    try {
      const ctx = getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy catch
    }
  }

  return {
    playBeep: playTerminalBeep,
    isMuted: () => isMuted
  };
}

function attachGlobalAudioClicks(audioSystem) {
  document.querySelectorAll('button, .nav-item, .theme-card, .faq-question, .logistics-pill').forEach(elem => {
    elem.addEventListener('mouseenter', () => {
      if (Math.random() > 0.6) {
        audioSystem.playBeep(1200, 'sine', 0.03, 0.02);
      }
    });
    elem.addEventListener('click', () => {
      audioSystem.playBeep(920, 'sine', 0.04, 0.04);
    });
  });
}

/* ==========================================================================
   2. EMERALD FALLOUT ASH & ENERGY PARTICLE CANVAS
   ========================================================================== */
function initFalloutCanvas() {
  const canvas = document.getElementById('fallout-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particleCount = 70;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.4 + 0.6,
      speedX: (Math.random() - 0.5) * 0.7,
      speedY: Math.random() * 1.1 + 0.35,
      opacity: Math.random() * 0.7 + 0.2,
      isEnergy: Math.random() > 0.5,
      flickerSpeed: Math.random() * 0.04 + 0.01
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y += p.speedY;
      p.x += p.speedX + Math.sin(p.y * 0.015) * 0.4;
      p.opacity += Math.sin(Date.now() * p.flickerSpeed) * 0.02;

      if (p.y > height) {
        p.y = -10;
        p.x = Math.random() * width;
      }
      if (p.x > width) p.x = 0;
      if (p.x < 0) p.x = width;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

      const isGateway = document.body.classList.contains('gateway-mode');

      if (isGateway) {
        // Red Spider-Man / Multiverse embers & cosmic gold dust (NO GREEN before entering)
        if (p.isEnergy) {
          ctx.fillStyle = `rgba(255, 45, 75, ${Math.max(0.12, Math.min(0.85, p.opacity))})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = `rgba(255, 45, 75, 0.7)`;
        } else {
          ctx.fillStyle = `rgba(251, 191, 36, ${Math.max(0.08, Math.min(0.65, p.opacity * 0.65))})`;
          ctx.shadowBlur = 4;
          ctx.shadowColor = `rgba(251, 191, 36, 0.5)`;
        }
      } else {
        // Doctor Doom Emerald Fallout Energy once main website is entered
        if (p.isEnergy) {
          ctx.fillStyle = `rgba(0, 255, 136, ${Math.max(0.1, Math.min(0.9, p.opacity))})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = `rgba(0, 255, 136, 0.7)`;
        } else {
          ctx.fillStyle = `rgba(251, 191, 36, ${Math.max(0.08, Math.min(0.6, p.opacity * 0.6))})`;
          ctx.shadowBlur = 4;
          ctx.shadowColor = `rgba(251, 191, 36, 0.5)`;
        }
      }
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
}

/* ==========================================================================
   3. COUNTDOWN TIMER (OCTOBER 10, 2026 - EVENT LAUNCH)
   ========================================================================== */
function initCountdownTimer() {
  const daysEl = document.getElementById('timer-days');
  const hoursEl = document.getElementById('timer-hours');
  const minsEl = document.getElementById('timer-minutes');
  const secsEl = document.getElementById('timer-seconds');
  const millisEl = document.getElementById('timer-millis');

  // October 10, 2026, 09:00 AM IST
  const targetDate = new Date('2026-10-10T09:00:00+05:30').getTime();

  function update() {
    const now = Date.now();
    let diff = targetDate - now;

    if (diff < 0) diff = 0;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    const millis = Math.floor((diff % 1000) / 10);

    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minsEl) minsEl.textContent = String(mins).padStart(2, '0');
    if (secsEl) secsEl.textContent = String(secs).padStart(2, '0');
    if (millisEl) millisEl.textContent = String(millis).padStart(2, '0');
  }

  setInterval(update, 37);
  update();
}

/* ==========================================================================
   4. POSTER LIGHTBOX & QR CODE MODAL
   ========================================================================== */
function initPosterLightbox(audioSystem) {
  const posterModal = document.getElementById('poster-modal');
  const openTriggers = [
    document.getElementById('view-poster-btn'),
    document.getElementById('open-poster-lightbox'),
    document.getElementById('btn-enlarge-poster'),
    document.getElementById('hero-view-poster-btn'),
    document.getElementById('prizes-view-poster-btn'),
    document.getElementById('hero-logo-trigger')
  ];
  const closeBtns = [
    document.getElementById('close-poster-btn'),
    document.getElementById('close-poster-lightbox-btn')
  ];
  const downloadBtn = document.getElementById('btn-download-poster');

  function openPoster() {
    if (posterModal) {
      posterModal.classList.add('open');
      audioSystem.playBeep(980, 'sine', 0.08, 0.06);
    }
  }

  function closePoster() {
    if (posterModal) {
      posterModal.classList.remove('open');
    }
  }

  openTriggers.forEach(trigger => {
    if (trigger) trigger.addEventListener('click', openPoster);
  });

  closeBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', closePoster);
  });

  if (posterModal) {
    posterModal.addEventListener('click', (e) => {
      if (e.target === posterModal) closePoster();
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = 'assets/samartha_poster.jpg';
      link.download = 'SAMARTHA_2026_Hackathon_Poster.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      audioSystem.playBeep(1100, 'square', 0.05, 0.05);
    });
  }
}

/* ==========================================================================
   5. 24-HOUR SCHEDULE STAGE TABS
   ========================================================================== */
function initScheduleTabs(audioSystem) {
  const pillBtns = document.querySelectorAll('.schedule-pill-btn');
  const container = document.getElementById('schedule-timeline-container');

  const stageData = {
    screening: [
      { date: '26 SEPT', status: 'DAY 1 SCREENING', title: 'Initial Proposal & Architecture Presentation', desc: 'Teams pitch their initial problem statement, chosen theme, and system architecture to faculty evaluators.', tags: ['Abstract Review', 'Theme Validation'] },
      { date: '27 SEPT', status: 'DAY 2 SCREENING', title: 'Screening Results & Shortlisted Squad Announcement', desc: 'Faculty review board selects the top squads advancing to the 24-hour physical hackathon on October 10-11.', tags: ['Finalist Selection', 'Mentor Allotment'] }
    ],
    'grand-finale': [
      { date: '10 OCT 09:00', status: 'ZERO HOUR START', highlight: true, title: '24-Hour Non-Stop Hackathon Commences', desc: 'The countdown starts. Teams code for 24 continuous hours inside the VIIT CSE computer labs with uninterrupted power, high-speed network, and meals.', tags: ['24H SPRINT', 'Mentorship Rounds'] },
      { date: '10 OCT 21:00', status: 'HALFWAY MARK', title: 'Mid-Sprint Architecture Review & Midnight Fuel', desc: 'Industry mentors from Cloudely & NXTMOVE inspect prototypes. High-energy snacks and beverages distributed.', tags: ['Code Checkpoint', 'Midnight Rations'] },
      { date: '11 OCT 09:00', status: 'CODE FREEZE', highlight: true, title: 'Submission Deadline, Live Pitches & ₹30,000+ Awards', desc: 'Final live product demonstrations in front of industry judges from Cloudely, NXTMOVE, NYERAS, and TBS. Winners crowned.', tags: ['Grand Stage Pitch', 'Trophy Distribution'] }
    ]
  };

  pillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const stage = btn.dataset.stage;
      pillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const items = stageData[stage];
      if (!items || !container) return;

      container.innerHTML = `
        <div class="timeline-items-list">
          ${items.map(item => `
            <div class="timeline-item ${item.highlight ? 'highlight-item' : ''}">
              <div class="time-col">
                <span class="time-val">${item.date}</span>
                <span class="time-status" ${item.highlight ? 'style="color: var(--accent);"' : ''}>${item.status}</span>
              </div>
              <div class="marker-col"><div class="marker-dot ${item.highlight ? 'pulse-green' : ''}"></div></div>
              <div class="info-col">
                <h4 class="event-title">${item.title}</h4>
                <p class="event-desc">${item.desc}</p>
                <div class="event-tags">
                  ${item.tags.map(t => `<span class="tag">${t}</span>`).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      audioSystem.playBeep(780, 'triangle', 0.05, 0.05);
    });
  });
}

/* ==========================================================================
   6. WAR ROOM OPERATIONS CONSOLE
   ========================================================================== */
function initWarRoomDashboard(audioSystem) {
  // Tabs
  const warTabs = document.querySelectorAll('.war-tab-btn');
  const warContents = document.querySelectorAll('.war-tab-content');

  warTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      warTabs.forEach(t => t.classList.remove('active'));
      warContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const contentEl = document.getElementById(`tab-${target}`);
      if (contentEl) contentEl.classList.add('active');

      audioSystem.playBeep(840, 'sine', 0.04, 0.04);
    });
  });

  // Telemetry Burst Simulation
  const burstBtn = document.getElementById('simulate-tick-btn');
  const metricEnlisted = document.getElementById('metric-enlisted');
  const liveStream = document.getElementById('live-stream-entries');

  let teamCount = 124;
  const sampleLogs = [
    "Team 'NeuralKnights' registered for Theme 01 (Agentic AI in Travel Tech).",
    "Screening panel allocated 18 squads to VIIT Lab Block 2.",
    "Student Coordinator Surya Sathwik approved fee verification for Squad #128.",
    "TBS technology mentors confirmed on-site participation for Oct 10.",
    "Agritech dataset updated with Andhra Pradesh soil and crop models."
  ];

  if (burstBtn) {
    burstBtn.addEventListener('click', () => {
      teamCount += Math.floor(Math.random() * 3) + 1;
      if (metricEnlisted) {
        metricEnlisted.innerHTML = `${teamCount} <span class="delta-up">+${Math.floor(Math.random() * 2) + 1} just now</span>`;
      }

      if (liveStream) {
        const now = new Date();
        const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
        const text = sampleLogs[Math.floor(Math.random() * sampleLogs.length)];

        const newLine = document.createElement('div');
        newLine.className = 'stream-line';
        newLine.innerHTML = `<span class="timestamp">${timeStr}</span> <span class="actor">CSE_DISPATCH:</span> ${text}`;
        liveStream.prepend(newLine);

        if (liveStream.children.length > 8) {
          liveStream.removeChild(liveStream.lastChild);
        }
      }

      audioSystem.playBeep(1200, 'square', 0.04, 0.05);
    });
  }

  // Rubric Calculator
  const sliderResilience = document.getElementById('slider-resilience');
  const sliderTech = document.getElementById('slider-technical');
  const sliderImpact = document.getElementById('slider-impact');
  const sliderReadiness = document.getElementById('slider-readiness');

  const displayResilience = document.getElementById('score-resilience');
  const displayTech = document.getElementById('score-technical');
  const displayImpact = document.getElementById('score-impact');
  const displayReadiness = document.getElementById('score-readiness');

  const totalScoreVal = document.getElementById('total-score-val');
  const totalVerdictText = document.getElementById('total-verdict-text');

  function calculateRubric() {
    const s1 = parseInt(sliderResilience.value, 10) || 0;
    const s2 = parseInt(sliderTech.value, 10) || 0;
    const s3 = parseInt(sliderImpact.value, 10) || 0;
    const s4 = parseInt(sliderReadiness.value, 10) || 0;

    displayResilience.textContent = `${s1} / 30`;
    displayTech.textContent = `${s2} / 25`;
    displayImpact.textContent = `${s3} / 25`;
    displayReadiness.textContent = `${s4} / 20`;

    const total = s1 + s2 + s3 + s4;
    totalScoreVal.textContent = `${total} / 100`;

    if (total >= 85) {
      totalVerdictText.textContent = "VERDICT: QUALIFIED FOR ₹30,000+ GRAND PODIUM";
      totalVerdictText.style.color = "var(--accent-bright)";
    } else if (total >= 70) {
      totalVerdictText.textContent = "VERDICT: MERIT FINALIST (ADVANCE TO STAGE 2)";
      totalVerdictText.style.color = "var(--gold-accent)";
    } else {
      totalVerdictText.textContent = "VERDICT: NEEDS ARCHITECTURAL REVISION";
      totalVerdictText.style.color = "var(--alert-red)";
    }
  }

  [sliderResilience, sliderTech, sliderImpact, sliderReadiness].forEach(slider => {
    if (slider) {
      slider.addEventListener('input', calculateRubric);
    }
  });
}

/* ==========================================================================
   7. FAQ ACCORDION & MOBILE NAVIGATION
   ========================================================================== */
function initFaqAccordion(audioSystem) {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    questionBtn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      faqItems.forEach(i => i.classList.remove('open'));

      if (!isOpen) {
        item.classList.add('open');
        audioSystem.playBeep(640, 'sine', 0.05, 0.04);
      }
    });
  });
}

function initMobileNavigation() {
  const mobileToggle = document.getElementById('mobile-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-item');

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      navMenu.classList.toggle('open');
    });

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
      });
    });
  }
}

/* ==========================================================================
   8. GATEWAY PORTAL ("BEYOND THE MULTIVERSE") ENGINE
   ========================================================================== */
function initGatewayPortal(audioSystem) {
  const enterBtn = document.getElementById('enter-world-btn');
  if (!enterBtn) return;

  let hasEntered = false;

  function handleEnter(e) {
    if (e && e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (hasEntered) return;
    hasEntered = true;

    // 1. Audio activation chord
    if (audioSystem) {
      try {
        if (typeof audioSystem.playCyberChime === 'function') audioSystem.playCyberChime();
        if (typeof audioSystem.playBeep === 'function') {
          setTimeout(() => audioSystem.playBeep(880, 'sine', 0.18, 0.08), 80);
        }
      } catch (err) {
        console.warn('Audio feedback error:', err);
      }
    }

    // 2. Multiverse Warp pulse wave
    try {
      const warpWave = document.createElement('div');
      warpWave.className = 'multiverse-warp-wave';
      document.body.appendChild(warpWave);
      setTimeout(() => warpWave.remove(), 1000);
    } catch (err) {}

    // 3. Immediate state switch
    document.body.classList.remove('gateway-mode');
    document.body.classList.add('site-entered');

    // 4. Clean up gate container
    setTimeout(() => {
      const gate = document.getElementById('enter-world-gate');
      if (gate) gate.style.display = 'none';
    }, 550);

    // 5. Smooth scroll to top of site
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 250);
  }

  enterBtn.addEventListener('click', handleEnter);
  enterBtn.addEventListener('touchend', handleEnter);
  enterBtn.addEventListener('keydown', handleEnter);
}
