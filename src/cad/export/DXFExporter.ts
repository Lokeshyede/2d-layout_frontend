import type { CADEntity, DimensionItem } from '../types';

export class DXFExporter {
  private out: string[] = [];

  constructor() {
    this.startSection('HEADER');
    this.endSection();
    
    this.startSection('TABLES');
    this.startTable('LAYER');
    this.addLayer('WALLS', 7);
    this.addLayer('COLUMNS', 2);
    this.addLayer('DOORS', 1);
    this.addLayer('WINDOWS', 5);
    this.addLayer('RACKS', 3);
    this.addLayer('DIMENSIONS', 1);
    this.endTable();
    this.endSection();
    
    this.startSection('ENTITIES');
  }

  public static exportToDXF(entities: CADEntity[], dimensions: DimensionItem[]): string {
    const exporter = new DXFExporter();
    exporter.processEntities(entities);
    exporter.processDimensions(dimensions);
    exporter.endSection();
    exporter.out.push('  0', 'EOF');
    return exporter.out.join('\n');
  }

  public static downloadDXF(dxfContent: string, filename: string) {
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private processEntities(entities: CADEntity[]) {
    for (const ent of entities) {
      if (ent.type === 'wall' || ent.type === 'partition') {
        const geom = (ent as any).geometry;
        this.addLine(geom.x1, -geom.y1, geom.x2, -geom.y2, 'WALLS');
      } else if (ent.type === 'column') {
        const geom = (ent as any).geometry;
        const w = geom.width || 24;
        const h = geom.height || 24;
        this.addRect(geom.x - w/2, -geom.y + h/2, w, h, 'COLUMNS');
      } else if (ent.type === 'rack') {
        const geom = (ent as any).geometry;
        const w = geom.width || 36;
        const h = geom.depth || 24;
        this.addRect(geom.x - w/2, -geom.y + h/2, w, h, 'RACKS');
      } else if (ent.type === 'door') {
        const geom = (ent as any).geometry;
        const w = geom.width || 36;
        this.addLine(geom.x - w/2, -geom.y, geom.x + w/2, -geom.y, 'DOORS');
        // Simple arc representation
        this.out.push('  0', 'ARC', '  8', 'DOORS', ' 10', (geom.x - w/2).toString(), ' 20', (-geom.y).toString(), ' 40', w.toString(), ' 50', '270', ' 51', '360');
      } else if (ent.type === 'window') {
        const geom = (ent as any).geometry;
        const w = geom.width || 48;
        this.addRect(geom.x - w/2, -geom.y + 4, w, 8, 'WINDOWS');
      } else if (ent.type === 'shutter' || ent.type === 'glass_gate') {
        const geom = (ent as any).geometry;
        const w = geom.width || 72;
        this.addRect(geom.x - w/2, -geom.y + 4, w, 8, 'DOORS');
      }
    }
  }

  private processDimensions(dimensions: DimensionItem[]) {
    for (const dim of dimensions) {
      this.addLine(dim.startPoint.x, -dim.startPoint.y, dim.endPoint.x, -dim.endPoint.y, 'DIMENSIONS');
      this.addText(dim.formattedValue, dim.labelPoint.x, -dim.labelPoint.y, 'DIMENSIONS');
    }
  }

  private startSection(name: string) {
    this.out.push('  0', 'SECTION', '  2', name);
  }

  private endSection() {
    this.out.push('  0', 'ENDSEC');
  }

  private startTable(name: string) {
    this.out.push('  0', 'TABLE', '  2', name);
  }

  private endTable() {
    this.out.push('  0', 'ENDTAB');
  }

  private addLayer(name: string, color: number) {
    this.out.push('  0', 'LAYER', '  2', name, ' 70', '0', ' 62', color.toString());
  }

  private addLine(x1: number, y1: number, x2: number, y2: number, layer: string) {
    this.out.push('  0', 'LINE', '  8', layer);
    this.out.push(' 10', x1.toString(), ' 20', y1.toString(), ' 30', '0.0');
    this.out.push(' 11', x2.toString(), ' 21', y2.toString(), ' 31', '0.0');
  }

  private addRect(x: number, y: number, w: number, h: number, layer: string) {
    this.addLine(x, y, x + w, y, layer);
    this.addLine(x + w, y, x + w, y - h, layer);
    this.addLine(x + w, y - h, x, y - h, layer);
    this.addLine(x, y - h, x, y, layer);
  }

  private addText(text: string, x: number, y: number, layer: string) {
    this.out.push('  0', 'TEXT', '  8', layer);
    this.out.push(' 10', x.toString(), ' 20', y.toString(), ' 30', '0.0');
    this.out.push(' 40', '8.0'); // text height
    this.out.push('  1', text);
  }
}
