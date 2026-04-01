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
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function mixColor(a, b, t) {
    return [
      lerp(a[0], b[0], t),
      lerp(a[1], b[1], t),
      lerp(a[2], b[2], t),
    ];
  }

  function rgbStr(c, a = 1) {
    return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
  }

  function colorLerp(stops, x) {
    if (x <= stops[0][0]) return stops[0][1];
    if (x >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

    for (let i = 0; i < stops.length - 1; i++) {
      const [x0, c0] = stops[i];
      const [x1, c1] = stops[i + 1];
      if (x >= x0 && x <= x1) {
        const t = (x - x0) / (x1 - x0);
        return mixColor(c0, c1, t);
      }
    }

    return stops[stops.length - 1][1];
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
    cloudLayers.push(createCloud(11, 0.64, 140, 240, 0.05, 0.12, 0.24));
    cloudLayers.push(createCloud(10, 0.75, 180, 300, 0.09, 0.18, 0.32));
    cloudLayers.push(createCloud(9, 0.87, 240, 390, 0.14, 0.24, 0.40));
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
    const hourAngle = hourAngleDeg * rad;
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
    const lunarAgeDays = phase * 29.530588853;

    // New moon rises near sunrise, first quarter near noon,
    // full moon near sunset, last quarter near midnight.
    const riseDelayHours = lunarAgeDays * 24 / 29.530588853;
    const shifted = new Date(date.getTime() - riseDelayHours * 3600000);

    const pos =
      observer.usingGeo && observer.lat != null && observer.lon != null
        ? solarPosition(shifted, observer.lat, observer.lon)
        : fallbackSolarPosition(shifted);

    // Add a small oscillation so the moon path feels less identical to the sun
    const seasonalTilt = Math.sin((dayOfYear(date) / 365) * Math.PI * 2 + phase * Math.PI * 2) * 8;

    return {
      altitude: pos.altitude + seasonalTilt,
      hourAngleDeg: pos.hourAngleDeg,
      phase,
      lunarAgeDays,
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
    ctx.clearRect(0, 0, width, height);

    const topStops = [
      [-18, [4, 8, 20]],
      [-12, [10, 20, 45]],
      [-7, [28, 52, 98]],
      [-2, [72, 110, 170]],
      [2, [140, 170, 210]],
      [10, [110, 170, 230]],
      [35, [52, 125, 220]],
      [60, [24, 98, 205]],
    ];

    const midStops = [
      [-18, [8, 14, 30]],
      [-12, [20, 36, 75]],
      [-7, [60, 92, 145]],
      [-2, [120, 146, 194]],
      [2, [255, 170, 120]],
      [10, [155, 198, 235]],
      [35, [112, 184, 245]],
      [60, [90, 170, 240]],
    ];

    const horizonStops = [
      [-18, [18, 24, 42]],
      [-12, [34, 42, 74]],
      [-7, [88, 92, 130]],
      [-2, [255, 144, 98]],
      [2, [255, 184, 118]],
      [10, [225, 218, 205]],
      [35, [208, 228, 245]],
      [60, [196, 222, 245]],
    ];

    const zenith = colorLerp(topStops, sunAlt);
    const mid = colorLerp(midStops, sunAlt);
    const horizon = colorLerp(horizonStops, sunAlt);

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, rgbStr(zenith, 1));
    grad.addColorStop(0.48, rgbStr(mid, 1));
    grad.addColorStop(0.82, rgbStr(horizon, 1));
    grad.addColorStop(1, rgbStr(horizon, 1));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const twilightStrength = Math.max(0, 1 - Math.abs(sunAlt + 1) / 10);
    if (twilightStrength > 0.01) {
      const warmGlow = ctx.createRadialGradient(
        width * 0.5,
        horizonY + 10,
        10,
        width * 0.5,
        horizonY + 10,
        width * 0.75
      );
      warmGlow.addColorStop(0, rgba(255, 190, 120, 0.28 * twilightStrength));
      warmGlow.addColorStop(0.28, rgba(255, 140, 90, 0.22 * twilightStrength));
      warmGlow.addColorStop(0.58, rgba(210, 120, 170, 0.14 * twilightStrength));
      warmGlow.addColorStop(1, rgba(0, 0, 0, 0));
      ctx.fillStyle = warmGlow;
      ctx.fillRect(0, 0, width, height);
    }

    const noonGlow = smoothstep(18, 55, sunAlt);
    if (noonGlow > 0.01) {
      const highLight = ctx.createRadialGradient(
        width * 0.5,
        height * 0.12,
        0,
        width * 0.5,
        height * 0.12,
        width * 0.65
      );
      highLight.addColorStop(0, rgba(255, 255, 255, 0.08 * noonGlow));
      highLight.addColorStop(1, rgba(255, 255, 255, 0));
      ctx.fillStyle = highLight;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function drawStars(t, sunAlt) {
    const night = 1 - smoothstep(-8, 8, sunAlt);
    if (night < 0.05) return;

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

    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.8);
    glow.addColorStop(0, rgba(255, 248, 224, 0.96));
    glow.addColorStop(0.14, rgba(255, 225, 160, 0.62));
    glow.addColorStop(0.42, rgba(255, 182, 98, 0.22));
    glow.addColorStop(1, rgba(255, 182, 98, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = rgba(255, 240, 188, 0.99);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawMoon(pos, sunAlt) {
    const night = 1 - smoothstep(-4, 10, sunAlt);
    if (night < 0.08) return;

    const { x, y } = bodyToXY(pos);
    const r = 24;
    const phase = pos.phase;
    const illum = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
    const waxing = phase < 0.5;

    const altitudeTint = smoothstep(-5, 30, pos.altitude);
    const moonBase = [
      lerp(255, 242, 1 - altitudeTint),
      lerp(236, 245, altitudeTint),
      lerp(210, 252, altitudeTint),
    ];

    ctx.save();

    const glowAlpha = (0.10 + illum * 0.18) * night;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
    glow.addColorStop(0, rgbStr(moonBase, glowAlpha));
    glow.addColorStop(1, rgba(255, 255, 255, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = rgbStr(moonBase, 0.96 * night);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    const k = Math.cos(2 * Math.PI * phase);
    const shadowOffset = k * r;

    ctx.beginPath();
    ctx.fillStyle = rgba(8, 14, 28, 0.92);
    ctx.ellipse(x + shadowOffset, y, r, r, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = rgbStr([255, 252, 245], 0.08 * illum * night);
    ctx.arc(x + (waxing ? -r * 0.18 : r * 0.18), y - r * 0.1, r * 0.72, 0, Math.PI * 2);
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
    const day = smoothstep(-4, 20, sunAlt);
    const dusk = Math.max(0, 1 - Math.abs(sunAlt) / 10);
    const night = 1 - smoothstep(-6, 8, sunAlt);

    const topR = 82 + day * 160 + dusk * 36;
    const topG = 92 + day * 156 + dusk * 26;
    const topB = 110 + day * 145 - dusk * 12;

    const bottomR = 58 + day * 112 + dusk * 125;
    const bottomG = 66 + day * 104 + dusk * 48;
    const bottomB = 84 + day * 108 - dusk * 22 + night * 10;

    const grad = ctx.createLinearGradient(
      cloud.x,
      cloud.y - cloud.size * 0.4,
      cloud.x,
      cloud.y + cloud.size * 0.4
    );
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
    halo.addColorStop(0, rgba(255, 210, 140, 0.30));
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
