/*
  REBA (Rapid Entire Body Assessment) calculator
  Computes ergonomic risk score from BlazePose body keypoints.
  All angles estimated from the 2D screen projection of the skeleton.
*/
(function () {
  'use strict';

  // --- math helpers ---
  function getKpt(kpts, name) {
    return kpts.find(function (k) { return k.part === name; });
  }
  function pos(k) { return k && k.score > 0.3 ? k.position : null; }
  function midpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  function vec(a, b) { return [b[0] - a[0], b[1] - a[1]]; }
  function angleDeg(v1, v2) {
    var dot = v1[0] * v2[0] + v1[1] * v2[1];
    var m1 = Math.hypot(v1[0], v1[1]);
    var m2 = Math.hypot(v2[0], v2[1]);
    if (m1 === 0 || m2 === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
  }
  // Signed angle from "vertical down" (positive = leaning forward in screen)
  function angleFromVertical(p1, p2) {
    var v = vec(p1, p2);
    return angleDeg(v, [0, 1]); // y grows downward
  }

  // --- REBA scoring tables (standard published REBA) ---
  // Table A [trunk-1][neck-1][legs-1] -> Score A
  var TABLE_A = [
    [ [1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 5, 6] ],
    [ [2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7] ],
    [ [2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8] ],
    [ [3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9] ],
    [ [4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9] ]
  ];
  // Table B [upperArm-1][lowerArm-1][wrist-1] -> Score B
  var TABLE_B = [
    [ [1, 2, 2], [1, 2, 3] ],
    [ [1, 2, 3], [2, 3, 4] ],
    [ [3, 4, 5], [4, 5, 5] ],
    [ [4, 5, 5], [5, 6, 7] ],
    [ [6, 7, 8], [7, 8, 8] ],
    [ [7, 8, 8], [8, 9, 9] ]
  ];
  // Table C [scoreA-1][scoreB-1] -> Score C
  var TABLE_C = [
    [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
    [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
    [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
    [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
    [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
    [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
    [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
    [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
    [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
    [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
    [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
    [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]
  ];

  // --- per-segment scoring (angles in degrees) ---
  function scoreTrunk(deg) {
    if (deg < 5) return 1;
    if (deg <= 20) return 2;
    if (deg <= 60) return 3;
    return 4;
  }
  function scoreNeck(deg) {
    if (deg <= 20) return 1;
    return 2;
  }
  function scoreLegs(_deg) {
    // Cannot reliably tell sitting vs unilateral support from 2D pose alone.
    // Default to 1 (bilateral standing). Knee flexion adds + when detected.
    return 1;
  }
  function scoreUpperArm(deg) {
    var a = Math.abs(deg);
    if (a <= 20) return 1;
    if (a <= 45) return 2;
    if (a <= 90) return 3;
    return 4;
  }
  function scoreLowerArm(deg) {
    // deg = elbow flexion angle (0 = straight, 90 = perpendicular)
    if (deg >= 60 && deg <= 100) return 1;
    return 2;
  }
  function scoreWrist(_deg) {
    // Wrist angle not reliably derivable from body-only keypoints.
    return 1;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function riskLevel(score) {
    if (score <= 1) return { level: 'Negligible', color: '#2ea043', action: 'No action required' };
    if (score <= 3) return { level: 'Low',        color: '#7ec97c', action: 'Change may be needed' };
    if (score <= 7) return { level: 'Medium',     color: '#d29922', action: 'Investigate, change soon' };
    if (score <= 10) return { level: 'High',      color: '#f0883e', action: 'Investigate and implement change' };
    return { level: 'Very High', color: '#f85149', action: 'Implement change now' };
  }

  function compute(bodyResult) {
    if (!bodyResult || !bodyResult.keypoints) return null;
    var k = bodyResult.keypoints;

    var lsh = pos(getKpt(k, 'leftShoulder')),  rsh = pos(getKpt(k, 'rightShoulder'));
    var lhp = pos(getKpt(k, 'leftHip')),       rhp = pos(getKpt(k, 'rightHip'));
    var nose = pos(getKpt(k, 'nose'));
    var lel = pos(getKpt(k, 'leftElbow')),     rel = pos(getKpt(k, 'rightElbow'));
    var lwr = pos(getKpt(k, 'leftWrist')),     rwr = pos(getKpt(k, 'rightWrist'));

    if (!lsh || !rsh || !lhp || !rhp) return null;

    var shoulder = midpoint(lsh, rsh);
    var hip      = midpoint(lhp, rhp);

    // Trunk angle from vertical (hip→shoulder vs straight up)
    var trunkVec = vec(hip, shoulder);
    var trunkAngle = angleDeg(trunkVec, [0, -1]); // straight up
    var trunkScore = scoreTrunk(trunkAngle);

    // Neck angle: shoulder→nose vs trunk direction
    var neckAngle = 0, neckScore = 1;
    if (nose) {
      var neckVec = vec(shoulder, nose);
      neckAngle = angleDeg(neckVec, [trunkVec[0], trunkVec[1]]);
      // Recompute relative to up-axis: if head leans forward we flag it
      neckAngle = angleDeg(neckVec, [0, -1]);
      neckScore = scoreNeck(Math.abs(neckAngle));
    }

    var legScore = scoreLegs(0);

    // Upper-arm: shoulder→elbow vs trunk (down)
    var upperAngleR = 0, upperAngleL = 0;
    if (rsh && rel) upperAngleR = angleDeg(vec(rsh, rel), [0, 1]);
    if (lsh && lel) upperAngleL = angleDeg(vec(lsh, lel), [0, 1]);
    var upperAngle = Math.max(upperAngleR, upperAngleL);
    var upperScore = scoreUpperArm(upperAngle);

    // Lower-arm: elbow flexion = angle(shoulder→elbow, elbow→wrist) — supplement for elbow joint
    var lowerAngleR = 90, lowerAngleL = 90;
    if (rsh && rel && rwr) lowerAngleR = 180 - angleDeg(vec(rsh, rel), vec(rel, rwr));
    if (lsh && lel && lwr) lowerAngleL = 180 - angleDeg(vec(lsh, lel), vec(lel, lwr));
    var lowerAngle = (Math.abs(lowerAngleR - 90) > Math.abs(lowerAngleL - 90)) ? lowerAngleR : lowerAngleL;
    var lowerScore = scoreLowerArm(lowerAngle);

    var wristScore = scoreWrist(0);

    // Lookup Score A and Score B
    var ti = clamp(trunkScore - 1, 0, 4);
    var ni = clamp(neckScore - 1, 0, 2);
    var li = clamp(legScore - 1, 0, 3);
    var scoreA = TABLE_A[ti][ni][li];

    var uai = clamp(upperScore - 1, 0, 5);
    var lai = clamp(lowerScore - 1, 0, 1);
    var wi  = clamp(wristScore - 1, 0, 2);
    var scoreB = TABLE_B[uai][lai][wi];

    var ai = clamp(scoreA - 1, 0, 11);
    var bi = clamp(scoreB - 1, 0, 11);
    var scoreC = TABLE_C[ai][bi];

    // Activity score not auto-detected; left at 0
    var rebaScore = scoreC;
    var risk = riskLevel(rebaScore);

    return {
      score: rebaScore,
      risk: risk,
      angles: {
        trunk: Math.round(trunkAngle),
        neck:  Math.round(neckAngle),
        upperArm: Math.round(upperAngle),
        lowerArm: Math.round(lowerAngle)
      },
      breakdown: {
        trunk: trunkScore,
        neck: neckScore,
        legs: legScore,
        upperArm: upperScore,
        lowerArm: lowerScore,
        wrist: wristScore,
        scoreA: scoreA,
        scoreB: scoreB,
        scoreC: scoreC
      }
    };
  }

  window.REBA = { compute: compute, riskLevel: riskLevel };
})();
