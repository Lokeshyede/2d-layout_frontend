import jsPDF from 'jspdf';

export interface ExportMetadata {
  surveyId: string;
  customerName: string;
  storeName: string;
  storeType: string;
  surveyDate: string;
  revision: string;
  scale?: string;
  salesmanName?: string;
  city?: string;
}

/**
 * SheetExporter — composes the architectural drawing sheet around a pre-rendered CAD canvas.
 *
 * ARCHITECTURE: This class does NOT re-render the CAD drawing.
 * The CAD canvas is produced by CADRenderer.renderToOffscreenCanvas(), which uses
 * the exact same code path as the live editor. SheetExporter only draws the
 * surrounding drawing sheet (border, header, footer, title block) and embeds the
 * CAD image into the sheet area.
 *
 * Live CAD = PNG = PDF  (all share the same CADRenderer pipeline)
 */
export class SheetExporter {
  private static readonly SHEET_W = 3508;
  private static readonly SHEET_H = 2480;
  private static readonly MARGIN = 80;

  /**
   * Compose the architectural drawing sheet around a pre-rendered CAD canvas.
   * Returns a PNG data URL of the full drawing sheet at 3508x2480 px.
   */
  public static composeSheetCanvas(
    cadCanvas: HTMLCanvasElement,
    meta: ExportMetadata
  ): string {
    const { SHEET_W, SHEET_H, MARGIN } = SheetExporter;
    const canvas = document.createElement('canvas');
    canvas.width = SHEET_W;
    canvas.height = SHEET_H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);

    const innerW = SHEET_W - MARGIN * 2;
    const innerH = SHEET_H - MARGIN * 2;

    // Outer border
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 8;
    ctx.strokeRect(MARGIN, MARGIN, innerW, innerH);

    // Red inner border
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3;
    ctx.strokeRect(MARGIN + 12, MARGIN + 12, innerW - 24, innerH - 24);

    // Header
    const headerH = 160;
    const headerY = MARGIN + 12;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(MARGIN + 12, headerY, innerW - 24, headerH);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(MARGIN + 12, headerY, 32, headerH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px Inter, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('RETAILFIX', MARGIN + 70, headerY + 90);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 32px Inter, sans-serif';
    ctx.fillText('STORE SURVEY & 2D CAD PLATFORM', MARGIN + 370, headerY + 88);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px Inter, sans-serif';
    ctx.fillText('ARCHITECTURAL STORE SURVEY & FIXTURE LAYOUT DRAWING', MARGIN + 70, headerY + 132);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SURVEY ID: ' + meta.surveyId, SHEET_W - MARGIN - 50, headerY + 80);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '24px Inter, sans-serif';
    ctx.fillText('DATE: ' + meta.surveyDate + '  |  REV: ' + meta.revision, SHEET_W - MARGIN - 50, headerY + 128);
    ctx.textAlign = 'left';

    // Footer layout
    const footerH = 380;
    const footerY = SHEET_H - MARGIN - 12 - footerH;
    const splitX = MARGIN + innerW * 0.45;

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(MARGIN + 12, footerY); ctx.lineTo(SHEET_W - MARGIN - 12, footerY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(splitX, footerY); ctx.lineTo(splitX, SHEET_H - MARGIN - 12); ctx.stroke();

    // Notes
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.fillText('DRAWING NOTES & SPECIFICATIONS', MARGIN + 40, footerY + 50);
    ctx.fillStyle = '#475569';
    ctx.font = '21px Inter, sans-serif';
    const notes = [
      "1. All dimensions are in architectural Feet & Inches (e.g. 50'-0\", 24'-6\").",
      "2. Only column width (along wall) and depth (inward) are shown inside the layout.",
      "3. Wall, shutter and all other dimensions are shown outside the layout boundary.",
      "4. Column Width = dimension along the wall. Column Depth = inward projection from wall.",
      "5. All rack positions are measured from interior wall face. Remaining space & aisles shown in green.",
      "6. 7×3 wall racks placed first (priority). 7×4 racks fill remaining valid wall space.",
      "7. This drawing is property of RETAILFIX CAD PLATFORM. Unauthorized reproduction prohibited.",
    ];
    notes.forEach(function(n, idx) {
      ctx.fillText(n, MARGIN + 40, footerY + 90 + idx * 32);
    });

    // Legend
    SheetExporter.drawLegend(ctx, MARGIN + 40, footerY + 310);

    // Title block
    const tbX = splitX + 30;
    const tbW = SHEET_W - MARGIN - 40 - tbX;
    const rows = [
      { label: 'PROJECT / STORE:', val: meta.storeName, label2: 'DRAWING NO:', val2: 'DWG-001' },
      { label: 'CUSTOMER NAME:', val: meta.customerName, label2: 'REVISION:', val2: meta.revision },
      { label: 'STORE TYPE:', val: meta.storeType, label2: 'SCALE:', val2: meta.scale || '1/4" = 1\'-0"' },
      { label: 'LOCATION / CITY:', val: meta.city || '-', label2: 'UNIT:', val2: 'Feet + Inches' },
      { label: 'SURVEYOR:', val: meta.salesmanName || 'RetailFix Surveyor', label2: 'STATUS:', val2: 'APPROVED' },
    ];
    const rowH = 65;
    rows.forEach(function(r, idx) {
      const ry = footerY + 25 + idx * rowH;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(tbX, ry, tbW, rowH - 6);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tbX, ry, tbW, rowH - 6);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#64748b'; ctx.font = 'bold 20px Inter, sans-serif';
      ctx.fillText(r.label, tbX + 15, ry + rowH / 2 - 3);
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 22px Inter, sans-serif';
      ctx.fillText(r.val, tbX + 240, ry + rowH / 2 - 3);
      ctx.fillStyle = '#64748b'; ctx.font = 'bold 20px Inter, sans-serif';
      ctx.fillText(r.label2, tbX + tbW * 0.62, ry + rowH / 2 - 3);
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 22px Inter, sans-serif';
      ctx.fillText(r.val2, tbX + tbW * 0.80, ry + rowH / 2 - 3);
    });
    ctx.textBaseline = 'alphabetic';

    // CAD area: embed the pre-rendered canvas
    const cadX = MARGIN + 30;
    const cadY = headerY + headerH + 30;
    const cadW = innerW - 60;
    const cadH = footerY - cadY - 30;

    // Light grid
    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
    for (let gx = cadX; gx <= cadX + cadW; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, cadY); ctx.lineTo(gx, cadY + cadH); ctx.stroke(); }
    for (let gy = cadY; gy <= cadY + cadH; gy += 60) { ctx.beginPath(); ctx.moveTo(cadX, gy); ctx.lineTo(cadX + cadW, gy); ctx.stroke(); }

    // Fit CAD canvas into area preserving aspect ratio
    const srcAspect = cadCanvas.width / cadCanvas.height;
    const dstAspect = cadW / cadH;
    let drawW = cadW, drawH = cadH, drawX = cadX, drawY = cadY;
    if (srcAspect > dstAspect) {
      drawH = cadW / srcAspect;
      drawY = cadY + (cadH - drawH) / 2;
    } else {
      drawW = cadH * srcAspect;
      drawX = cadX + (cadW - drawW) / 2;
    }
    ctx.drawImage(cadCanvas, drawX, drawY, drawW, drawH);

    // CAD area border
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
    ctx.strokeRect(cadX, cadY, cadW, cadH);

    return canvas.toDataURL('image/png');
  }

  /**
   * Generate and download a PDF containing the composed drawing sheet.
   * Uses jsPDF to produce a valid A3 Landscape PDF.
   * Always uses the current live CAD state (no DB round-trip).
   */
  public static exportToPDF(
    cadCanvas: HTMLCanvasElement,
    meta: ExportMetadata,
    filename: string
  ): void {
    const sheetDataUrl = SheetExporter.composeSheetCanvas(cadCanvas, meta);

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3',
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.addImage(sheetDataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
    pdf.save(filename);
  }

  /** Download a data URL as a file. */
  public static downloadFile(dataUrl: string, filename: string) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  private static drawLegend(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const lineH = 34;
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('LEGEND:', x, y);

    let lx = x + 90;

    // Wall (dark filled rect)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(lx, y - 14, 36, 18);
    ctx.fillStyle = '#475569'; ctx.font = '19px Inter, sans-serif';
    ctx.fillText('Wall (W)', lx + 44, y);
    lx += 170;

    // Wall Rack (white rect with dark border)
    ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
    ctx.fillRect(lx, y - 14, 36, 18); ctx.strokeRect(lx, y - 14, 36, 18);
    // bold top edge
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(lx, y - 14); ctx.lineTo(lx + 36, y - 14); ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = '19px Inter, sans-serif'; ctx.lineWidth = 1;
    ctx.fillText('Wall Rack (W-RACK)', lx + 44, y);
    lx += 260;

    // Corner Rack CRN (green fill)
    ctx.fillStyle = '#dcfce7'; ctx.strokeStyle = '#166534'; ctx.lineWidth = 2;
    ctx.fillRect(lx, y - 14, 20, 18); ctx.strokeRect(lx, y - 14, 20, 18);
    ctx.fillRect(lx, y - 14, 20, 18); // wing A overlap
    ctx.fillRect(lx, y - 14, 8, 8); // inner corner stub
    ctx.fillStyle = '#475569'; ctx.font = '19px Inter, sans-serif'; ctx.lineWidth = 1;
    ctx.fillText('Corner Rack (CRN)', lx + 28, y);
    lx += 250;

    // Center Rack (blue fill)
    ctx.fillStyle = '#dbeafe'; ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2;
    ctx.fillRect(lx, y - 14, 28, 18); ctx.strokeRect(lx, y - 14, 28, 18);
    ctx.fillStyle = '#475569'; ctx.font = '19px Inter, sans-serif'; ctx.lineWidth = 1;
    ctx.fillText('Center Rack', lx + 36, y);
    lx += 200;

    // Wall Column W-COL (dark near-black fill)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(lx, y - 14, 22, 18);
    ctx.fillStyle = '#475569'; ctx.font = '19px Inter, sans-serif';
    ctx.fillText('Wall Column (W-COL)', lx + 30, y);

    // Row 2
    lx = x + 90;
    const y2 = y + lineH;

    // Shutter (zigzag red line)
    ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath();
    const step = 6;
    let up2 = true;
    for (let sx2 = lx; sx2 <= lx + 40; sx2 += step) {
      ctx.lineTo(sx2, y2 + (up2 ? -6 : 2));
      up2 = !up2;
    }
    ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = '19px Inter, sans-serif';
    ctx.fillText('Shutter', lx + 48, y2);
    lx += 170;

    // Aisle / Remaining Space (dashed green line with arrow)
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(lx, y2 - 4); ctx.lineTo(lx + 40, y2 - 4); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#16a34a';
    // arrowhead right
    ctx.beginPath();
    ctx.moveTo(lx + 40, y2 - 4);
    ctx.lineTo(lx + 34, y2 - 7);
    ctx.lineTo(lx + 34, y2 - 1);
    ctx.closePath(); ctx.fill();
    // arrowhead left
    ctx.beginPath();
    ctx.moveTo(lx, y2 - 4);
    ctx.lineTo(lx + 6, y2 - 7);
    ctx.lineTo(lx + 6, y2 - 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#475569'; ctx.font = '19px Inter, sans-serif';
    ctx.fillText('Aisle / Remaining Space', lx + 48, y2);
  }
}
