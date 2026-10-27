import re

file_path = "src/components/CAD/CADEditor.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add entitiesRef
content = re.sub(
    r"(const \[entities, setEntities\] = useState<CADEntity\[\]>\(\[\]\);)",
    r"\1\n  const entitiesRef = useRef<CADEntity[]>([]);\n  useEffect(() => {\n    entitiesRef.current = entities;\n  }, [entities]);",
    content
)

# 2. Fix AutoSave Race Condition
auto_save_regex = r"const triggerAutoSave = useCallback\(\(newEntities: CADEntity\[\]\) => \{[\s\S]*?\}, \[projectId, projectData, surveyToken\]\);"

new_auto_save = """const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<CADEntity[] | null>(null);

  const performSave = async (ents: CADEntity[]) => {
    if (isSavingRef.current) {
      pendingSaveRef.current = ents;
      return;
    }
    isSavingRef.current = true;
    setSaveStatus('saving');
    try {
      await api.saveProject(projectId, {
        title: projectData?.title || 'Store Layout',
        scale: '1/4" = 1\'-0"',
        unit: 'Feet + Inches',
        viewport: viewportRef.current.getState(),
        entities: ents,
      }, surveyToken);
      setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
    } catch (err) {
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        const next = pendingSaveRef.current;
        pendingSaveRef.current = null;
        performSave(next);
      }
    }
  };

  const triggerAutoSave = useCallback((newEntities: CADEntity[]) => {
    setSaveStatus('unsaved');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performSave(newEntities);
    }, 800);
  }, [projectId, projectData, surveyToken]);"""

content = re.sub(auto_save_regex, new_auto_save, content)

# 3. Update renderScene to use entitiesRef.current
render_scene_regex = r"(const renderScene = useCallback\(\(\) => \{[\s\S]*?rendererRef\.current\.render\(\{[\s\S]*?\}\);\s*\}, \[.*?\]\);)"

def replace_render_scene(match):
    m = match.group(1)
    m = m.replace("entities,", "entities: entitiesRef.current,")
    m = m.replace("entities,\n      selectedEntityId", "entitiesRef.current,\n      selectedEntityId")
    m = m.replace("entities,\n        selectedEntityId", "entitiesRef.current,\n        selectedEntityId")
    return m

content = re.sub(render_scene_regex, replace_render_scene, content)

# 4. Update onMouseMove to map entitiesRef.current synchronously
mouse_move_drag = r"setEntities\(\(prev\) =>\s*prev\.map\(\(ent\): CADEntity => \{([\s\S]*?)return ent;\s*\}\)\s*\);"

def replace_mouse_move_drag(match):
    body = match.group(1)
    new_code = f"""const nextEnts = entitiesRef.current.map((ent): CADEntity => {{
{body}return ent;
          }});
          entitiesRef.current = nextEnts;
          setEntities(nextEnts);"""
    return new_code

content = re.sub(mouse_move_drag, replace_mouse_move_drag, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Applied Phase 1 fixes successfully")
