const skyCanvas = document.getElementById("sky");

if (skyCanvas) {
  const ctx = skyCanvas.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;

  const observer = {
    lat: null,
    lon: null,
    usingGeo: false,
  };

  const stars = [];
  const cloudLayers = [];
  const STAR_COUNT = 320;
  const HORIZON_RATIO = 0.62;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rgba(r, g, b, a = 1) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function resizeSky() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    skyCanvas.width = width * dpr;
    skyCanvas.height = height * dpr;
    skyCanvas.style.width = width + "px";
    skyCanvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildStars();
    buildClouds();
  }

  function buildStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.72,
        r: random(0.45, 1.75),
        baseAlpha: random(0.25, 0.95),
        twinkle: random(0.6, 2.4),
        driftX: random(-0.008, 0.008),
        driftY: random(-0.018, 0.018),
      });
    }
  }

  function createCloud(count, baseYRatio, sizeMin, sizeMax, speedMin, speedMax, alpha) {
    const clouds = [];
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: random(-240, width + 200),
        y: height * baseYRatio + random(-28, 42),
        size: random(sizeMin, sizeMax),
        speed: random(speedMin, speedMax),
        alpha,
        puffOffset: Array.from({ length: 5 }, () => ({
          ox: random(-0.42, 0.42),
          oy: random(-0.18, 0.18),
          scale: random(0.55, 1.1),
        })),
      });
    }
    return clouds;
  }

  function buildClouds() {
    cloudLayers.length = 0;
    cloudLayers.push(createCloud(11, 0.64, 140, 240, 0.05, 0.12, 0.26));
    cloudLayers.push(createCloud(10, 0.75, 180, 300, 0.09, 0.18, 0.34));
    cloudLayers.push(createCloud(9, 0.87, 240, 390, 0.14, 0.24, 0.42));
  }

  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / 86400000);
  }

  function solarPosition(date, lat, lon) {
    const rad = Math.PI / 180;
    const n = dayOfYear(date);
    const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const gamma = 2 * Math.PI / 365 * (n - 1 + (hours - 12) / 24);

    const eqtime = 229.18 * (
      0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma)
    );

    const decl =
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);

    const timezone = -date.getTimezoneOffset() / 60;
    const timeOffset = eqtime + 4 * lon - 60 * timezone;
    const trueSolarMinutes = hours * 60 + timeOffset;
    const hourAngleDeg = trueSolarMinutes / 4 - 180;
    const hourAngle = hourAngleDeg * Math.PI / 180;
    const latRad = lat * rad;

    const cosZenith =
      Math.sin(latRad) * Math.sin(decl) +
      Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle);

    const zenith = Math.acos(clamp(cosZenith, -1, 1));
    const altitude = 90 - zenith / rad;

    return { altitude, hourAngleDeg };
  }

  function fallbackSolarPosition(date) {
    const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const t = (h - 6) / 12;
    const altitude = Math.sin(t * Math.PI) * 72 - 8;
    const hourAngleDeg = (h / 24) * 360 - 180;
    return { altitude, hourAngleDeg };
  }

  function getSun(date) {
    if (observer.usingGeo && observer.lat != null && observer.lon != null) {
      return solarPosition(date, observer.lat, observer.lon);
    }
    return fallbackSolarPosition(date);
  }

  function moonPhase(date) {
    const synodicMonth = 29.530588853;
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
    const days = (date.getTime() - knownNewMoon) / 86400000;
    let phase = (days / synodicMonth) % 1;
    if (phase < 0) phase += 1;
    return phase;
  }

  function getMoon(date) {
    const phase = moonPhase(date);
    const shifted = new Date(date.getTime() + (12.85 + phase * 1.2) * 3600000);
    const pos = observer.usingGeo && observer.lat != null && observer.lon != null
      ? solarPosition(shifted, observer.lat, observer.lon)
      : fallbackSolarPosition(shifted);

    return {
      altitude: pos.altitude,
      hourAngleDeg: pos.hourAngleDeg,
      phase,
    };
  }

  function bodyToXY(pos) {
    const horizonY = height * HORIZON_RATIO;
    const x = width * (0.5 + clamp(pos.hourAngleDeg, -110, 110) / 220 * 0.84);
    const altitudeNorm = clamp((pos.altitude + 12) / 84, 0, 1);
    const y = horizonY - altitudeNorm * height * 0.48;
    return { x, y };
  }

  function drawSky(sunAlt) {
    const horizonY = height * HORIZON_RATIO;
    const day = smoothstep(-6, 18, sunAlt);
    const dawnDusk = Math.max(smoothstep(-12, 8, sunAlt) - smoothstep(8, 24, sunAlt), 0);
    const blueHour = Math.max(smoothstep(-10, -2, sunAlt) - smoothstep(-2, 6, sunAlt), 0);
    const night = 1 - smoothstep(-10, 6, sunAlt);

    ctx.clearRect(0, 0, width, height);

    const nightGrad = ctx.createLinearGradient(0, 0, 0, height);
    nightGrad.addColorStop(0, rgba(4, 10, 28, 1));
    nightGrad.addColorStop(0.5, rgba(10, 22, 55, 1));
    nightGrad.addColorStop(1, rgba(20, 26, 48, 1));
    ctx.fillStyle = nightGrad;
    ctx.fillRect(0, 0, width, height);

    if (day > 0) {
      ctx.save();
      ctx.globalAlpha = day;
      const dayGrad = ctx.createLinearGradient(0, 0, 0, height);
      dayGrad.addColorStop(0, rgba(43, 112, 212, 1));
      dayGrad.addColorStop(0.38, rgba(102, 171, 244, 1));
      dayGrad.addColorStop(0.72, rgba(176, 218, 255, 1));
      dayGrad.addColorStop(1, rgba(236, 243, 255, 1));
      ctx.fillStyle = dayGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (blueHour > 0.01) {
      ctx.save();
      ctx.globalAlpha = blueHour * 0.9;
      const blueGrad = ctx.createLinearGradient(0, 0, 0, height);
      blueGrad.addColorStop(0, rgba(18, 44, 100, 0.78));
      blueGrad.addColorStop(0.54, rgba(54, 95, 168, 0.54));
      blueGrad.addColorStop(1, rgba(130, 150, 190, 0.18));
      ctx.fillStyle = blueGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (dawnDusk > 0.01) {
      ctx.save();
      ctx.globalAlpha = dawnDusk;

      const warmBand = ctx.createLinearGradient(0, horizonY - 120, 0, height);
      warmBand.addColorStop(0, rgba(255, 193, 120, 0));
      warmBand.addColorStop(0.3, rgba(255, 168, 92, 0.36));
      warmBand.addColorStop(0.58, rgba(255, 128, 86, 0.52));
      warmBand.addColorStop(0.84, rgba(196, 104, 160, 0.28));
      warmBand.addColorStop(1, rgba(0, 0, 0, 0));
      ctx.fillStyle = warmBand;
      ctx.fillRect(0, horizonY - 140, width, height - horizonY + 140);

      const upperWarmth = ctx.createRadialGradient(width * 0.5, horizonY - 28, 20, width * 0.5, horizonY - 28, width * 0.68);
      upperWarmth.addColorStop(0, rgba(255, 206, 140, 0.42));
      upperWarmth.addColorStop(0.28, rgba(255, 165, 106, 0.26));
      upperWarmth.addColorStop(0.54, rgba(201, 118, 170, 0.14));
      upperWarmth.addColorStop(1, rgba(0, 0, 0, 0));
      ctx.fillStyle = upperWarmth;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    if (night > 0.12) {
      ctx.save();
      ctx.globalAlpha = night * 0.44;
      const glowA = ctx.createRadialGradient(width * 0.16, height * 0.16, 0, width * 0.16, height * 0.16, width * 0.34);
      glowA.addColorStop(0, rgba(72, 92, 180, 0.28));
      glowA.addColorStop(1, rgba(72, 92, 180, 0));
      ctx.fillStyle = glowA;
      ctx.fillRect(0, 0, width, height);

      const glowB = ctx.createRadialGradient(width * 0.84, height * 0.14, 0, width * 0.84, height * 0.14, width * 0.28);
      glowB.addColorStop(0, rgba(120, 88, 180, 0.2));
      glowB.addColorStop(1, rgba(120, 88, 180, 0));
      ctx.fillStyle = glowB;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  function drawStars(t, sunAlt) {
    const night = 1 - smoothstep(-8, 8, sunAlt);
    if (night < 0.06) return;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const star of stars) {
      star.x += star.driftX;
      star.y += star.driftY;

      if (star.x < -2) star.x = width + 2;
      if (star.x > width + 2) star.x = -2;
      if (star.y < -2) star.y = height * 0.72 + 2;
      if (star.y > height * 0.72 + 2) star.y = -2;

      const twinkle = 0.55 + 0.45 * Math.sin(t * 0.0012 * star.twinkle + star.x * 0.012 + star.y * 0.008);
      const alpha = clamp(star.baseAlpha * twinkle * night * 1.35, 0, 1);
      ctx.beginPath();
      ctx.fillStyle = rgba(255, 255, 255, alpha);
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSun(pos, sunAlt) {
    if (sunAlt < -8) return;
    const { x, y } = bodyToXY(pos);
    const r = lerp(28, 44, smoothstep(-6, 30, sunAlt));

    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6);
    glow.addColorStop(0, rgba(255, 248, 224, 0.95));
    glow.addColorStop(0.16, rgba(255, 224, 158, 0.58));
    glow.addColorStop(0.46, rgba(255, 182, 98, 0.22));
    glow.addColorStop(1, rgba(255, 182, 98, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = rgba(255, 239, 184, 0.98);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMoon(pos, sunAlt) {
    const night = 1 - smoothstep(-6, 8, sunAlt);
    if (night < 0.16) return;

    const { x, y } = bodyToXY(pos);
    const r = 26;
    const phase = pos.phase;
    const illum = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
    const waxing = phase < 0.5;
    const shadowShift = (1 - illum) * r * 2 * (waxing ? -1 : 1);

    ctx.save();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    glow.addColorStop(0, rgba(255, 255, 255, 0.28 * night));
    glow.addColorStop(1, rgba(255, 255, 255, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = rgba(242, 245, 250, 0.95 * night);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-atop";
    ctx.beginPath();
    ctx.fillStyle = rgba(10, 18, 40, 0.92);
    ctx.arc(x + shadowShift, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCloudBand(sunAlt) {
    const horizonY = height * HORIZON_RATIO;
    const day = smoothstep(-6, 18, sunAlt);
    const dusk = Math.max(0, 1 - Math.abs(sunAlt) / 14);

    const grad = ctx.createLinearGradient(0, horizonY - 30, 0, height);
    grad.addColorStop(0, rgba(255, 255, 255, 0.03 + day * 0.04));
    grad.addColorStop(0.32, rgba(210, 220, 236, 0.08 + day * 0.08 + dusk * 0.06));
    grad.addColorStop(1, rgba(10, 16, 34, 0.42));
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizonY - 30, width, height - horizonY + 30);
  }

  function drawCloudPuff(cloud, layerIndex, sunAlt) {
    const day = smoothstep(-6, 18, sunAlt);
    const dusk = Math.max(0, 1 - Math.abs(sunAlt) / 16);
    const night = 1 - smoothstep(-8, 10, sunAlt);

    const topR = 112 + day * 118 + dusk * 68;
    const topG = 126 + day * 112 + dusk * 34;
    const topB = 160 + day * 86 - dusk * 8;

    const bottomR = 54 + day * 58 + dusk * 118;
    const bottomG = 70 + day * 66 + dusk * 38;
    const bottomB = 112 + day * 52 - dusk * 18 + night * 14;

    const grad = ctx.createLinearGradient(cloud.x, cloud.y - cloud.size * 0.4, cloud.x, cloud.y + cloud.size * 0.4);
    grad.addColorStop(0, rgba(topR, topG, topB, cloud.alpha));
    grad.addColorStop(1, rgba(bottomR, bottomG, bottomB, cloud.alpha * 0.95));
    ctx.fillStyle = grad;

    for (const puff of cloud.puffOffset) {
      const rx = cloud.size * puff.scale * 0.7;
      const ry = cloud.size * puff.scale * 0.36;
      ctx.beginPath();
      ctx.ellipse(
        cloud.x + puff.ox * cloud.size,
        cloud.y + puff.oy * cloud.size + layerIndex * 6,
        rx,
        ry,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawClouds(sunAlt) {
    drawCloudBand(sunAlt);

    cloudLayers.forEach((layer, layerIndex) => {
      for (const cloud of layer) {
        cloud.x += cloud.speed;
        if (cloud.x - cloud.size * 1.2 > width + 260) {
          cloud.x = -cloud.size * 1.4 - 160;
        }
        drawCloudPuff(cloud, layerIndex, sunAlt);
      }
    });
  }

  function drawHaze(sunAlt, sunPos) {
    const { x, y } = bodyToXY(sunPos);
    const haze = Math.max(0, 1 - Math.abs(sunAlt) / 18);
    if (haze < 0.08) return;

    ctx.save();
    ctx.globalAlpha = haze * 0.42;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, width * 0.34);
    halo.addColorStop(0, rgba(255, 210, 140, 0.3));
    halo.addColorStop(1, rgba(255, 210, 140, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function renderSky(t) {
    const now = new Date();
    const sun = getSun(now);
    const moon = getMoon(now);

    drawSky(sun.altitude);
    drawStars(t, sun.altitude);
    drawHaze(sun.altitude, sun);
    drawSun(sun, sun.altitude);
    drawMoon(moon, sun.altitude);
    drawClouds(sun.altitude);

    requestAnimationFrame(renderSky);
  }

  function requestLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        observer.lat = pos.coords.latitude;
        observer.lon = pos.coords.longitude;
        observer.usingGeo = true;
      },
      () => {
        observer.usingGeo = false;
      },
      {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: 5000,
      }
    );
  }

  window.addEventListener("resize", resizeSky);
  resizeSky();
  requestLocation();
  requestAnimationFrame(renderSky);
}
