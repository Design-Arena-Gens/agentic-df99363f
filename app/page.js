"use client";

import { useEffect, useRef, useState } from "react";

const LEVEL = {
  width: 2400,
  ceiling: 40,
  platforms: [
    { x: 0, y: 470, width: 620, height: 250, bounce: 0.28 },
    { x: 700, y: 450, width: 280, height: 220, bounce: 0.32 },
    { x: 1050, y: 420, width: 260, height: 220, bounce: 0.35 },
    { x: 1380, y: 450, width: 260, height: 220, bounce: 0.28 },
    { x: 1700, y: 470, width: 400, height: 230, bounce: 0.3 }
  ],
  hazards: [
    { x: 620, y: 470, width: 80, height: 90 },
    { x: 1320, y: 450, width: 70, height: 80 }
  ],
  finish: { x: 2140, y: 360, width: 60, height: 160 }
};

const POGO_LENGTH = 110;
const BODY_RADIUS = 28;
const HEAD_RADIUS = 18;
const CAMERA_LERP = 0.12;
const GRAVITY = 2200;
const AIR_DRAG = 0.88;
const MAX_VELOCITY_X = 420;
const STEP_TIME = 1 / 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getFootPosition(character) {
  return { x: character.position.x, y: character.position.y };
}

function resetCharacter() {
  return {
    position: { x: 140, y: 430 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    tilt: 0,
    springCompression: 0,
    onGround: false,
    airborneTimer: 0
  };
}

export default function Page() {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const stateRef = useRef({
    character: resetCharacter(),
    cameraX: 0,
    status: "playing",
    elapsed: 0
  });
  const keysRef = useRef({
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    Space: false
  });
  const [statusText, setStatusText] = useState("Reach the finish line!");
  const [statusClass, setStatusClass] = useState("");
  const [hudStats, setHudStats] = useState({ time: 0, distance: LEVEL.finish.x - 140 });
  const hudUpdateRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const context = canvas.getContext("2d");
    const state = stateRef.current;
    const character = state.character;

    const handleKeyDown = (event) => {
      if (event.repeat) return;
      if (event.code in keysRef.current) {
        keysRef.current[event.code] = true;
        event.preventDefault();
      }
      if (event.code === "KeyR") {
        restart();
      }
    };

    const handleKeyUp = (event) => {
      if (event.code in keysRef.current) {
        keysRef.current[event.code] = false;
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let accumulator = 0;
    let lastTimestamp = performance.now();

    function restart() {
      stateRef.current = {
        character: resetCharacter(),
        cameraX: 0,
        status: "playing",
        elapsed: 0
      };
      keysRef.current = {
        ArrowLeft: false,
        ArrowRight: false,
        ArrowUp: false,
        Space: false
      };
      setStatusText("Reach the finish line!");
      setStatusClass("");
      setHudStats({ time: 0, distance: LEVEL.finish.x - 140 });
      hudUpdateRef.current = 0;
    }

    function updatePhysics(step) {
      const currentState = stateRef.current;
      if (currentState.status !== "playing") {
        return;
      }

      const ch = currentState.character;
      const keys = keysRef.current;

      currentState.elapsed += step;
      ch.onGround = false;

      const moveAccel = 1500;
      if (keys.ArrowLeft) {
        ch.velocity.x -= moveAccel * step;
      }
      if (keys.ArrowRight) {
        ch.velocity.x += moveAccel * step;
      }

      if (!keys.ArrowLeft && !keys.ArrowRight && ch.onGround) {
        ch.velocity.x *= 0.8;
      }

      ch.velocity.x = clamp(ch.velocity.x, -MAX_VELOCITY_X, MAX_VELOCITY_X);

      ch.velocity.y += GRAVITY * step;

      ch.position.x += ch.velocity.x * step;
      ch.position.y += ch.velocity.y * step;

      ch.position.x = clamp(ch.position.x, 0, LEVEL.width - 40);

      resolveCollisions(ch);
      resolveHazards(ch);
      resolveCeiling(ch);

      if (ch.onGround) {
        ch.velocity.x *= 0.82;
      } else {
        ch.velocity.x *= AIR_DRAG;
      }

      if (ch.onGround) {
        ch.springCompression = clamp(ch.springCompression * 0.92 + Math.min(1, Math.abs(ch.velocity.y) / 900) * 0.45, 0, 1);
        ch.airborneTimer = 0;
      } else {
        ch.springCompression = clamp(ch.springCompression * 0.85, 0, 1);
        ch.airborneTimer += step;
      }

      const wantsJump = keys.ArrowUp || keys.Space;
      if (wantsJump && ch.onGround) {
        ch.velocity.y = -1050;
        ch.velocity.x += clamp(ch.velocity.x, -1, 1) * 60;
        ch.onGround = false;
        ch.springCompression = 1;
      }

      ch.tilt = clamp(ch.tilt * 0.85 + (ch.velocity.x / MAX_VELOCITY_X) * 0.18, -0.5, 0.5);
      if (!ch.onGround) {
        ch.rotation += (ch.velocity.x / 320) * step;
      } else {
        ch.rotation *= 0.6;
      }

      const finishLine = LEVEL.finish;
      if (ch.position.x >= finishLine.x + finishLine.width / 2) {
        currentState.status = "victory";
        setStatusText("Victory! Pogo Stickman survives!");
        setStatusClass("victory");
      }

      if (currentState.status === "playing") {
        hudUpdateRef.current += step;
        if (hudUpdateRef.current >= 0.12) {
          hudUpdateRef.current = 0;
          setHudStats({
            time: currentState.elapsed,
            distance: Math.max(0, Math.floor(finishLine.x + finishLine.width / 2 - ch.position.x))
          });
        }
      }
    }

    function resolveCollisions(ch) {
      const foot = getFootPosition(ch);
      for (const platform of LEVEL.platforms) {
        const top = platform.y;
        const left = platform.x;
        const right = platform.x + platform.width;
        if (foot.x >= left && foot.x <= right) {
          const penetration = foot.y - top;
          if (penetration >= 0 && penetration <= platform.height + 60) {
            if (ch.velocity.y >= 0) {
              ch.position.y -= penetration;
              ch.velocity.y *= -platform.bounce;
              if (Math.abs(ch.velocity.y) < 60) {
                ch.velocity.y = 0;
              }
              ch.onGround = true;
            }
          }
        }

        const bodyBottom = ch.position.y - (POGO_LENGTH * 0.5);
        if (bodyBottom <= top && bodyBottom >= top - 40) {
          const bodyX = ch.position.x;
          if (bodyX + BODY_RADIUS > left && bodyX - BODY_RADIUS < right && ch.velocity.y < 0) {
            ch.position.y = top + POGO_LENGTH * 0.5;
            ch.velocity.y = Math.max(0, ch.velocity.y);
          }
        }
      }
    }

    function resolveHazards(ch) {
      const bodyCenterY = ch.position.y - (POGO_LENGTH * 0.7);
      const headCenterY = bodyCenterY - BODY_RADIUS - HEAD_RADIUS + 6;
      for (const hazard of LEVEL.hazards) {
        if (rectCircleIntersect(hazard, ch.position.x, bodyCenterY, BODY_RADIUS)) {
          triggerFail("Ouch! The spikes were unforgiving.");
          return;
        }
        if (rectCircleIntersect(hazard, ch.position.x, headCenterY, HEAD_RADIUS)) {
          triggerFail("Head first into spikes...");
          return;
        }
        const foot = getFootPosition(ch);
        if (rectPointIntersect(hazard, foot.x, foot.y + 4)) {
          triggerFail("Impaled! Try a softer landing.");
          return;
        }
      }

      if (ch.position.y > 760) {
        triggerFail("You tumbled into the abyss.");
      }
    }

    function resolveCeiling(ch) {
      const headY = ch.position.y - (POGO_LENGTH * 0.9) - BODY_RADIUS - HEAD_RADIUS;
      if (headY < LEVEL.ceiling) {
        ch.position.y += LEVEL.ceiling - headY;
        ch.velocity.y = Math.max(0, ch.velocity.y * -0.2);
      }
    }

    function triggerFail(message) {
      const currentState = stateRef.current;
      if (currentState.status !== "playing") return;
      currentState.status = "fail";
      setStatusText(message + " Press R to retry.");
      setStatusClass("fail");
    }

    function stepSimulation(delta) {
      accumulator += delta;
      while (accumulator >= STEP_TIME) {
        updatePhysics(STEP_TIME);
        accumulator -= STEP_TIME;
      }
    }

    function drawScene() {
      const currentState = stateRef.current;
      const ctx = context;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.save();

      currentState.cameraX = clamp(
        currentState.cameraX + (currentState.character.position.x - currentState.cameraX - canvasWidth / 2) * CAMERA_LERP,
        0,
        LEVEL.width - canvasWidth
      );
      ctx.translate(-currentState.cameraX, 0);

      renderBackground(ctx, canvasWidth, canvasHeight, currentState.cameraX);
      renderPlatforms(ctx);
      renderHazards(ctx);
      renderFinish(ctx);
      renderCharacter(ctx, currentState.character);

      ctx.restore();

      if (currentState.status !== "playing") {
        ctx.save();
        ctx.fillStyle = "rgba(6, 8, 18, 0.55)";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.restore();
      }
    }

    function loop(timestamp) {
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      const safeDelta = clamp(delta, 0, 0.05);
      stepSimulation(safeDelta);
      drawScene();

      animationFrameRef.current = requestAnimationFrame(loop);
    }

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <main>
      <div className="card">
        <h1>Happy Wheels Clone: Pogo Stickman</h1>
        <p>
          Bounce, balance, and survive this mini-level inspired by the classic Happy Wheels. Use the arrow keys to lean and
          thrust, space or up to bounce, and R to reset.
        </p>
        <div className="hud">
          <span className={`status ${statusClass}`}>{statusText}</span>
          <span className="controls">
            Time: {hudStats.time.toFixed(1)}s · Distance to finish: {hudStats.distance}px
          </span>
        </div>
        <canvas ref={canvasRef} width={960} height={540} />
      </div>
    </main>
  );
}

function renderBackground(ctx, canvasWidth, canvasHeight, cameraX) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#6dc0ff");
  gradient.addColorStop(0.45, "#8ed7ff");
  gradient.addColorStop(0.46, "#3c4b8a");
  gradient.addColorStop(1, "#151a33");
  ctx.fillStyle = gradient;
  ctx.fillRect(cameraX, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.translate(0, 120);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 6; i += 1) {
    const cloudX = (i * 380 + cameraX * 0.4) % (LEVEL.width + 400) - 200;
    ctx.beginPath();
    ctx.ellipse(cloudX, 60, 140, 50, 0, 0, Math.PI * 2);
    ctx.ellipse(cloudX + 70, 50, 120, 40, 0, 0, Math.PI * 2);
    ctx.ellipse(cloudX - 60, 55, 90, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderPlatforms(ctx) {
  for (const platform of LEVEL.platforms) {
    const top = platform.y;
    ctx.fillStyle = "#30375a";
    ctx.fillRect(platform.x, top, platform.width, platform.height);
    ctx.fillStyle = "#6c7ae0";
    ctx.fillRect(platform.x, top - 8, platform.width, 14);
    for (let i = 0; i < platform.width; i += 28) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      ctx.fillRect(platform.x + i, top - 8, 14, 14);
    }
  }
}

function renderHazards(ctx) {
  ctx.fillStyle = "#ff6076";
  ctx.strokeStyle = "#ffe2e2";
  ctx.lineWidth = 2;
  for (const hazard of LEVEL.hazards) {
    const spikeCount = Math.max(3, Math.floor(hazard.width / 18));
    const spikeWidth = hazard.width / spikeCount;
    for (let i = 0; i < spikeCount; i += 1) {
      const left = hazard.x + i * spikeWidth;
      const right = left + spikeWidth;
      const peakX = left + spikeWidth / 2;
      const baseY = hazard.y;
      const peakY = hazard.y - hazard.height;
      ctx.beginPath();
      ctx.moveTo(left, baseY);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(right, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

function renderFinish(ctx) {
  const finish = LEVEL.finish;
  ctx.fillStyle = "#675dff";
  ctx.fillRect(finish.x, finish.y, finish.width, finish.height);
  ctx.fillStyle = "#f8f9ff";
  ctx.font = "24px 'Segoe UI', sans-serif";
  ctx.save();
  ctx.translate(finish.x + finish.width / 2, finish.y + 30);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("FINISH", 0, 8);
  ctx.restore();

  ctx.fillStyle = "#2f2a6a";
  ctx.fillRect(finish.x - 12, finish.y + finish.height - 16, finish.width + 24, 16);
}

function renderCharacter(ctx, ch) {
  ctx.save();
  ctx.translate(ch.position.x, ch.position.y);
  ctx.rotate(ch.tilt);

  const effectiveLength = POGO_LENGTH * (1 - ch.springCompression * 0.35);
  const handleY = -effectiveLength;
  const torsoY = handleY - BODY_RADIUS * 2;

  ctx.strokeStyle = "#f5f5f7";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, handleY);
  ctx.stroke();

  ctx.fillStyle = "#f5f5f7";
  ctx.fillRect(-24, handleY - 8, 48, 14);

  ctx.fillStyle = "#ffb74d";
  ctx.beginPath();
  ctx.ellipse(0, torsoY + BODY_RADIUS, BODY_RADIUS + 4, BODY_RADIUS, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(0, torsoY - BODY_RADIUS);
  ctx.rotate(ch.rotation);
  ctx.fillStyle = "#ffd95b";
  ctx.beginPath();
  ctx.arc(0, -HEAD_RADIUS, HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c1f2e";
  ctx.beginPath();
  ctx.arc(-6, -HEAD_RADIUS - 3, 4, 0, Math.PI * 2);
  ctx.arc(6, -HEAD_RADIUS - 3, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f47d7d";
  ctx.beginPath();
  ctx.arc(0, -HEAD_RADIUS + 6, 6, 0, Math.PI);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "#a0a7ff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-12, handleY + BODY_RADIUS);
  ctx.lineTo(-46, handleY + BODY_RADIUS + 36);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(12, handleY + BODY_RADIUS);
  ctx.lineTo(46, handleY + BODY_RADIUS + 36);
  ctx.stroke();

  ctx.strokeStyle = "#ffd95b";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-16, handleY - 20);
  ctx.lineTo(-48, handleY - 44);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(16, handleY - 20);
  ctx.lineTo(48, handleY - 44);
  ctx.stroke();

  ctx.restore();
}

function rectCircleIntersect(rect, cx, cy, radius) {
  const closestX = clamp(cx, rect.x, rect.x + rect.width);
  const closestY = clamp(cy, rect.y - rect.height, rect.y);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function rectPointIntersect(rect, px, py) {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y - rect.height && py <= rect.y;
}
