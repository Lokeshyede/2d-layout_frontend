import type { CADEntity } from '../types';

export interface HistoryState {
  entities: CADEntity[];
  description?: string;
  timestamp: number;
}

export class HistoryManager {
  private undoStack: HistoryState[] = [];
  private redoStack: HistoryState[] = [];
  private maxHistory: number = 50;

  constructor(initialEntities: CADEntity[] = []) {
    this.pushInitialState(initialEntities);
  }

  public pushInitialState(entities: CADEntity[]) {
    this.undoStack = [{
      entities: JSON.parse(JSON.stringify(entities)),
      description: 'Initial',
      timestamp: Date.now(),
    }];
    this.redoStack = [];
  }

  public pushState(entities: CADEntity[], description?: string) {
    const current = this.getCurrentState();
    const serializedNew = JSON.stringify(entities);
    if (current && JSON.stringify(current.entities) === serializedNew) {
      return;
    }

    this.undoStack.push({
      entities: JSON.parse(serializedNew),
      description: description || 'Action',
      timestamp: Date.now(),
    });

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  public undo(): CADEntity[] | null {
    if (this.undoStack.length <= 1) return null;

    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    const target = this.undoStack[this.undoStack.length - 1];
    return JSON.parse(JSON.stringify(target.entities));
  }

  public redo(): CADEntity[] | null {
    if (this.redoStack.length === 0) return null;

    const target = this.redoStack.pop()!;
    this.undoStack.push(target);

    return JSON.parse(JSON.stringify(target.entities));
  }

  public canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getCurrentState(): HistoryState | null {
    return this.undoStack[this.undoStack.length - 1] || null;
  }
}
