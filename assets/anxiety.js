/*
  Anxiety / stress-state estimator from face analysis.
  Uses the Human.js emotion model output (angry, disgust, fear, happy, sad, surprise, neutral).
*/
(function () {
  'use strict';

  // Weights map emotion probability → contribution to a normalized anxiety index [0..1].
  // Negative weights for emotions that indicate calmness.
  var WEIGHTS = {
    fear:     1.0,
    sad:      0.5,
    angry:    0.4,
    surprise: 0.3,
    disgust:  0.3,
    happy:   -0.6,
    neutral: -0.3
  };

  function indexFromEmotions(emotionArray) {
    if (!emotionArray || emotionArray.length === 0) return null;
    var raw = 0;
    var dominant = { emotion: 'neutral', score: 0 };
    for (var i = 0; i < emotionArray.length; i++) {
      var e = emotionArray[i];
      var w = WEIGHTS[e.emotion] || 0;
      raw += w * e.score;
      if (e.score > dominant.score) dominant = e;
    }
    // Map raw range [~ -0.9 .. 1.0] into [0..1]
    var idx = Math.max(0, Math.min(1, (raw + 0.6) / 1.6));
    return { index: idx, dominant: dominant };
  }

  function stateLabel(idx) {
    if (idx < 0.2) return { label: 'Calm',      color: '#2ea043' };
    if (idx < 0.4) return { label: 'Relaxed',   color: '#7ec97c' };
    if (idx < 0.6) return { label: 'Neutral',   color: '#8b949e' };
    if (idx < 0.8) return { label: 'Tense',     color: '#d29922' };
    return                  { label: 'Anxious',  color: '#f85149' };
  }

  function compute(faceResult) {
    if (!faceResult || !faceResult.emotion || faceResult.emotion.length === 0) return null;
    var result = indexFromEmotions(faceResult.emotion);
    if (!result) return null;
    var state = stateLabel(result.index);
    return {
      index: result.index,        // 0..1
      percent: Math.round(result.index * 100),
      dominant: result.dominant,
      state: state,
      emotions: faceResult.emotion
    };
  }

  window.Anxiety = { compute: compute, stateLabel: stateLabel };
})();
