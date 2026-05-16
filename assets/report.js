/*
  Ergonomic-assessment PDF report generator.
  Uses jsPDF (loaded from CDN in index.html as window.jspdf).
  Pulls the latest values tracked by the analysis panel and produces a printable PDF.
*/
(function () {
  'use strict';

  function fmtDate(d) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function canvasToImage(canvas, maxWidth) {
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    var ratio = canvas.height / canvas.width;
    var w = Math.min(maxWidth, canvas.width);
    var h = w * ratio;
    return { data: canvas.toDataURL('image/jpeg', 0.8), w: w, h: h };
  }

  function generate(state) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library failed to load. Check your network connection and reload.');
      return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'pt', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 40;
    var y = margin;

    // --- header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(20, 60, 130);
    doc.text('Ergonomic Assessment Report', margin, y);
    y += 22;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text('Generated ' + fmtDate(new Date()) + '  ·  3D Animator', margin, y);
    y += 8;
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 18;

    // --- REBA section ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text('Posture Risk (REBA)', margin, y);
    y += 18;

    if (state.reba) {
      var r = state.reba;
      // Score box
      var boxX = margin;
      var col = r.risk.color || '#888';
      var rgb = hexToRgb(col);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.roundedRect(boxX, y, 80, 50, 6, 6, 'F');
      doc.setTextColor(255);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text(String(r.score), boxX + 40, y + 32, { align: 'center' });
      doc.setFontSize(8);
      doc.text('REBA', boxX + 40, y + 44, { align: 'center' });

      // Text next to box
      doc.setTextColor(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(r.risk.level + ' Risk', boxX + 96, y + 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(r.risk.action, boxX + 96, y + 34);

      y += 64;

      // Angle table
      doc.setFontSize(10);
      doc.setTextColor(40);
      doc.setFont('helvetica', 'bold');
      doc.text('Measured angles & component scores', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      var rows = [
        ['Trunk angle',     r.angles.trunk + '°',     'score ' + r.breakdown.trunk],
        ['Neck angle',      r.angles.neck + '°',      'score ' + r.breakdown.neck],
        ['Upper-arm angle', r.angles.upperArm + '°',  'score ' + r.breakdown.upperArm],
        ['Lower-arm angle', r.angles.lowerArm + '°',  'score ' + r.breakdown.lowerArm],
        ['Legs (estimated)', '—',                     'score ' + r.breakdown.legs],
        ['Wrist (estimated)', '—',                    'score ' + r.breakdown.wrist]
      ];
      for (var i = 0; i < rows.length; i++) {
        doc.setTextColor(40);
        doc.text(rows[i][0], margin + 6, y);
        doc.text(rows[i][1], margin + 180, y);
        doc.setTextColor(100);
        doc.text(rows[i][2], margin + 260, y);
        y += 12;
      }
      y += 6;
      doc.setTextColor(60);
      doc.text('Group A score (trunk·neck·legs): ' + r.breakdown.scoreA, margin + 6, y); y += 12;
      doc.text('Group B score (arms·wrist): '     + r.breakdown.scoreB, margin + 6, y); y += 12;
      doc.text('Group C score (combined): '       + r.breakdown.scoreC, margin + 6, y); y += 16;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120);
      doc.text('Body detection not enabled — REBA could not be computed.', margin, y);
      y += 20;
    }

    // --- Anxiety / Stress section ---
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text('Affective State (Stress / Anxiety)', margin, y);
    y += 18;

    if (state.anxiety) {
      var a = state.anxiety;
      var rgbA = hexToRgb(a.state.color);
      doc.setFillColor(rgbA.r, rgbA.g, rgbA.b);
      doc.roundedRect(margin, y, 80, 50, 6, 6, 'F');
      doc.setTextColor(255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(a.percent + '%', margin + 40, y + 30, { align: 'center' });
      doc.setFontSize(8);
      doc.text('STRESS', margin + 40, y + 44, { align: 'center' });

      doc.setTextColor(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(a.state.label, margin + 96, y + 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text('Dominant emotion: ' + a.dominant.emotion +
               ' (' + Math.round(a.dominant.score * 100) + '%)',
               margin + 96, y + 34);
      y += 64;

      // Emotion breakdown bar list
      doc.setFontSize(10);
      doc.setTextColor(40);
      doc.setFont('helvetica', 'bold');
      doc.text('Emotion probabilities', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      var sorted = a.emotions.slice().sort(function (x, y) { return y.score - x.score; });
      for (var j = 0; j < sorted.length; j++) {
        var e = sorted[j];
        var pct = Math.round(e.score * 100);
        doc.setTextColor(40);
        doc.text(e.emotion, margin + 6, y);
        var barX = margin + 90, barW = 200;
        doc.setFillColor(230);
        doc.roundedRect(barX, y - 8, barW, 10, 2, 2, 'F');
        doc.setFillColor(80, 130, 200);
        doc.roundedRect(barX, y - 8, barW * e.score, 10, 2, 2, 'F');
        doc.setTextColor(100);
        doc.text(pct + '%', barX + barW + 8, y);
        y += 14;
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120);
      doc.text('Face detection (with emotion) not enabled — anxiety not computed.', margin, y);
      y += 20;
    }

    // --- snapshots (one on second page if first is full) ---
    var imgOverlay = canvasToImage(document.getElementById('output-overlay'), pageW - 2 * margin);
    var imgMesh    = canvasToImage(document.getElementById('output-mesh'),    pageW - 2 * margin);
    if (imgOverlay || imgMesh) {
      doc.addPage();
      y = margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(20);
      doc.text('Snapshots', margin, y); y += 18;
      if (imgOverlay) {
        var w1 = Math.min(imgOverlay.w, pageW - 2 * margin);
        var h1 = w1 * (imgOverlay.h / imgOverlay.w);
        doc.addImage(imgOverlay.data, 'JPEG', margin, y, w1, h1);
        y += h1 + 8;
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text('2D detection overlay', margin, y); y += 18;
      }
      if (imgMesh) {
        var maxH = doc.internal.pageSize.getHeight() - margin - y;
        var w2 = Math.min(imgMesh.w, pageW - 2 * margin);
        var h2 = w2 * (imgMesh.h / imgMesh.w);
        if (h2 > maxH) { h2 = maxH; w2 = h2 * (imgMesh.w / imgMesh.h); }
        doc.addImage(imgMesh.data, 'JPEG', margin, y, w2, h2);
        y += h2 + 8;
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text('3D reconstructed scene', margin, y);
      }
    }

    // --- footer note ---
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('3D Animator · ergonomic assessment · page ' + p + ' / ' + pages,
               pageW / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' });
    }

    doc.save('ergonomic-report-' + Date.now() + '.pdf');
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  window.ReportPDF = { generate: generate };
})();
