# 🎯 Realitea Canvas - Feature Implementation Roadmap

**Goal:** Become a solid alternative to Excalidraw with unique differentiation

**Last Updated:** 2025-10-18

---

## 📊 Current Competitive Analysis

### Comparison Matrix: Realitea Canvas vs. Excalidraw

| Feature | Realitea Canvas | Excalidraw | Status | Priority |
|---------|-----------------|------------|--------|----------|
| **Core Features** |
| Real-time collaboration | ✅ | ✅ | **At Parity** | - |
| Hand-drawn style (sloppiness) | ✅ | ✅ | **At Parity** | - |
| Local-first architecture | ✅ | ✅ | **At Parity** | - |
| Pen/Drawing tool | ✅ | ✅ | **At Parity** | - |
| Basic shapes (rect, ellipse, diamond) | ✅ | ✅ | **At Parity** | - |
| Text elements | ✅ | ✅ | **At Parity** | - |
| Export to PNG/SVG | ✅ | ✅ | **At Parity** | - |
| **Our Advantages** |
| File attachments | ✅ | ❌ | **✨ Ahead** | Maintain |
| Minimap navigation | ✅ | ❌ | **✨ Ahead** | Maintain |
| Multiple pen backgrounds | ✅ | ❌ | **✨ Ahead** | Maintain |
| **Missing Features (High Priority)** |
| Smart/sticky connectors | ❌ | ✅ | **⚠️ Behind** | P1 |
| Extensive shape library | ❌ | ✅ | **⚠️ Behind** | P1 |
| Grouping elements | ❌ | ✅ | **⚠️ Behind** | P1 |
| Alignment tools | ❌ | ✅ | **⚠️ Behind** | P1 |
| Comprehensive keyboard shortcuts | ❌ | ✅ | **⚠️ Behind** | P1 |
| Z-index controls | ❌ | ✅ | **⚠️ Behind** | P1 |
| **Missing Features (Medium Priority)** |
| Grid & snapping | ❌ | ✅ | **⚠️ Behind** | P2 |
| Component libraries | ❌ | ✅ | **⚠️ Behind** | P2 |
| More export options | ❌ | ✅ | **⚠️ Behind** | P2 |
| Link/hyperlink support | ❌ | ✅ | **⚠️ Behind** | P2 |
| **Differentiation Opportunities** |
| AI-powered features | ❌ | ❌ | **🚀 Opportunity** | P3 |
| Live data integration | ❌ | ❌ | **🚀 Opportunity** | P3 |
| Nested/infinite boards | ❌ | ❌ | **🚀 Opportunity** | P4 |
| Advanced collaboration modes | ❌ | ❌ | **🚀 Opportunity** | P4 |

---

## 🎯 Implementation Roadmap

### Phase 1: Essential Parity Features (Month 1-2)

#### **1.1 Keyboard Shortcuts System** ⏱️ 1 week
**Status:** 🔴 Not Started
**Impact:** High | **Effort:** Medium

**Features:**
- [ ] Global keyboard shortcut handler
- [ ] Tool switching: `V` (select), `R` (rectangle), `E` (ellipse), `D` (diamond), `A` (arrow), `L` (line), `P` (pen), `T` (text)
- [ ] Actions: `Ctrl+D` (duplicate), `Ctrl+Z` (undo), `Ctrl+Y` (redo)
- [ ] Delete: `Delete` or `Backspace` removes selected elements
- [ ] Selection: `Ctrl+A` (select all)
- [ ] Copy/Paste: `Ctrl+C`, `Ctrl+V` (already implemented, ensure works)
- [ ] Pan: `Space + Drag` (hand tool)
- [ ] Zoom: `Ctrl + Scroll` or `+/-` keys

**Technical Notes:**
- Create `src/hooks/useKeyboardShortcuts.ts`
- Use `useEffect` with global event listeners
- Prevent conflicts with browser shortcuts
- Add visual indicator for active shortcuts

**Files to modify:**
- `src/components/canvas/WhiteboardCanvas.tsx`
- New: `src/hooks/useKeyboardShortcuts.ts`
- New: `src/components/ui/KeyboardShortcutHelper.tsx` (help overlay)

---

#### **1.2 Grouping & Ungrouping** ⏱️ 2 weeks
**Status:** 🔴 Not Started
**Impact:** High | **Effort:** High

**Features:**
- [ ] `Ctrl+G` - Group selected elements
- [ ] `Ctrl+Shift+G` - Ungroup selected group
- [ ] Groups move together
- [ ] Groups resize proportionally
- [ ] Groups can be nested
- [ ] Visual indicator for grouped elements (subtle border/badge)
- [ ] Context menu: "Group" / "Ungroup"

**Data Structure:**
```typescript
// Add to CanvasElement type
type GroupElement = {
  id: string;
  type: "group";
  x: number;
  y: number;
  width: number;
  height: number;
  children: string[]; // IDs of child elements
  rotation: number;
  opacity: number;
}
```

**Technical Notes:**
- Store groups as special element type
- Transform operations apply to all children
- Update `getElementBounds()` to handle groups
- Selection should highlight entire group

**Files to modify:**
- `src/lib/store/useWhiteboardStore.ts` (add group type)
- `src/components/canvas/WhiteboardCanvas.tsx` (rendering & interaction)
- `src/lib/canvas/bounds.ts` (update bounds calculation)

---

#### **1.3 Alignment & Distribution Tools** ⏱️ 1 week
**Status:** 🔴 Not Started
**Impact:** High | **Effort:** Medium

**Features:**
- [ ] Align left
- [ ] Align center horizontally
- [ ] Align right
- [ ] Align top
- [ ] Align center vertically
- [ ] Align bottom
- [ ] Distribute horizontally (even spacing)
- [ ] Distribute vertically (even spacing)
- [ ] Toolbar buttons for alignment
- [ ] Keyboard shortcuts: `Ctrl+Shift+L/C/R/T/M/B`

**UI Location:**
- Add alignment toolbar when 2+ elements selected
- Float above selection or in main toolbar

**Technical Notes:**
- Calculate bounds of all selected elements
- Determine target alignment position
- Update element positions in batch

**Files to create:**
- `src/components/canvas/AlignmentToolbar.tsx`
- `src/lib/canvas/alignment.ts` (alignment calculations)

---

#### **1.4 Z-Index Controls** ⏱️ 3 days
**Status:** 🔴 Not Started
**Impact:** Medium | **Effort:** Low

**Features:**
- [ ] Bring to front - `Ctrl+Shift+]`
- [ ] Send to back - `Ctrl+Shift+[`
- [ ] Bring forward - `Ctrl+]`
- [ ] Send backward - `Ctrl+[`
- [ ] Context menu options
- [ ] Right-click → "Arrange" submenu

**Technical Notes:**
- Elements already rendered in array order
- Reorder elements in the `elements` array
- Update Yjs shared array order

**Files to modify:**
- `src/components/canvas/WhiteboardCanvas.tsx` (context menu)
- `src/lib/store/useWhiteboardStore.ts` (add reorder actions)

---

### Phase 2: Smart Connectors & Shapes (Month 3-4)

#### **2.1 Smart/Sticky Arrows** ⏱️ 3 weeks
**Status:** 🔴 Not Started
**Impact:** Very High | **Effort:** Very High

**Features:**
- [ ] Connection points on shapes (4 sides + 4 corners = 8 points)
- [ ] Snap arrow endpoints to connection points
- [ ] Arrows follow shapes when moved
- [ ] Auto-routing to avoid shape intersections
- [ ] Arrow labels/text
- [ ] Bidirectional arrows
- [ ] Different arrow head styles

**Data Structure:**
```typescript
type ConnectorElement = {
  id: string;
  type: "connector";
  startBinding: {
    elementId: string;
    pointIndex: number; // 0-7 for connection points
  } | null;
  endBinding: {
    elementId: string;
    pointIndex: number;
  } | null;
  points: number[]; // Path points
  label?: string;
  arrowType: "arrow-end" | "arrow-both" | "arrow-start";
  // ... other properties
}
```

**Technical Notes:**
- Calculate connection points for each shape type
- Implement magnetic snapping (threshold ~20px)
- Update arrow path when bound elements move
- Use A* or similar for auto-routing
- Add arrow label rendering

**Files to create:**
- `src/lib/canvas/connectors.ts` (connection logic)
- `src/components/canvas/elements/ConnectorRenderer.tsx`

---

#### **2.2 Extended Shape Library** ⏱️ 2 weeks
**Status:** 🔴 Not Started
**Impact:** High | **Effort:** Medium

**New Shapes:**
- [ ] Triangle
- [ ] Hexagon
- [ ] Star (5-pointed, configurable)
- [ ] Cloud
- [ ] Cylinder (3D-ish)
- [ ] Database symbol
- [ ] Process box (rounded rectangle)
- [ ] Decision diamond (same as current diamond)
- [ ] Document shape
- [ ] Callout/speech bubble

**UI:**
- [ ] Shape picker panel (sidebar or modal)
- [ ] Search shapes by name
- [ ] Recent shapes
- [ ] Favorites

**Files to create:**
- `src/lib/canvas/shapes/` (directory)
  - `triangle.ts`
  - `hexagon.ts`
  - `star.ts`
  - etc.
- `src/components/ui/ShapePicker.tsx`

---

### Phase 3: Grid, Snapping & Export (Month 5)

#### **3.1 Grid & Snapping System** ⏱️ 1.5 weeks
**Status:** 🔴 Not Started
**Impact:** Medium | **Effort:** Medium

**Features:**
- [ ] Grid overlay (configurable size: 10px, 20px, 50px)
- [ ] Toggle grid visibility
- [ ] Snap to grid (toggle on/off)
- [ ] Snap to objects (align with nearby elements)
- [ ] Smart guides (temporary alignment lines)
- [ ] Snap threshold configuration

**Technical Notes:**
- Render grid as background pattern
- Round positions to nearest grid point when snap enabled
- Show temporary guide lines during drag

**Files to create:**
- `src/components/canvas/GridOverlay.tsx`
- `src/lib/canvas/snapping.ts`

---

#### **3.2 Enhanced Export Options** ⏱️ 1 week
**Status:** 🔴 Not Started
**Impact:** Medium | **Effort:** Low

**Features:**
- [ ] Export to PDF
- [ ] Export selection only
- [ ] Background options: transparent, white, custom color
- [ ] Scale options: 1x, 2x, 3x, 4x
- [ ] Include/exclude grid in export
- [ ] Embed fonts in export

**Files to modify:**
- `src/components/canvas/WhiteboardCanvas.tsx` (export functions)

---

### Phase 4: Templates & Libraries (Month 6)

#### **4.1 Template System** ⏱️ 2 weeks
**Status:** 🔴 Not Started
**Impact:** Medium | **Effort:** Medium

**Templates:**
- [ ] Flowchart
- [ ] Wireframe (UI mockup)
- [ ] Mind map
- [ ] System architecture
- [ ] User journey map
- [ ] SWOT analysis
- [ ] Kanban board

**Features:**
- [ ] Template gallery
- [ ] "Start from template" on homepage
- [ ] Save current canvas as template
- [ ] Share templates with team

**Files to create:**
- `src/components/templates/TemplateGallery.tsx`
- `src/lib/templates/` (template definitions)

---

### Phase 5: AI & Differentiation (Month 7-8)

#### **5.1 AI Diagram Assistant** ⏱️ 4 weeks
**Status:** 🔴 Not Started
**Impact:** Very High | **Effort:** Very High

**Features:**
- [ ] Text-to-diagram generation
  - "Create a user authentication flowchart"
  - "Generate a 3-tier architecture diagram"
- [ ] Auto-layout/beautify diagram
- [ ] Shape recognition from rough sketches
- [ ] Smart connector suggestions
- [ ] Diagram completion suggestions

**Technical Approach:**
- Use OpenAI GPT-4 or Claude API
- Prompt engineering for diagram generation
- Parse AI response → generate elements
- Train on common diagram patterns

**Files to create:**
- `src/lib/ai/diagramGenerator.ts`
- `src/components/ai/AIAssistant.tsx`

---

#### **5.2 Live Data Integration** ⏱️ 3 weeks
**Status:** 🔴 Not Started
**Impact:** High | **Effort:** High

**Features:**
- [ ] Connect shapes to data sources
- [ ] REST API integration
- [ ] Database queries
- [ ] Real-time data updates
- [ ] Dynamic charts from data
- [ ] Conditional formatting based on data

**Example Use Cases:**
- Server status dashboard
- Metrics visualization
- Live architecture diagrams

**Files to create:**
- `src/lib/integrations/dataConnector.ts`
- `src/components/data/DataBindingPanel.tsx`

---

## 🚀 Quick Wins (Implement This Week)

### **QW-1: Delete Key Support** ⏱️ 2 hours
**Status:** 🔴 Not Started

Add `Delete` and `Backspace` key handlers to remove selected elements.

**Files:** `src/components/canvas/WhiteboardCanvas.tsx`

---

### **QW-2: Duplicate with Ctrl+D** ⏱️ 3 hours
**Status:** 🔴 Not Started

Duplicate selected elements with small offset.

**Files:** `src/components/canvas/WhiteboardCanvas.tsx`

---

### **QW-3: Basic Z-Index (Context Menu)** ⏱️ 4 hours
**Status:** 🔴 Not Started

Add "Bring Forward" / "Send Backward" to context menu.

**Files:** `src/components/canvas/WhiteboardCanvas.tsx`

---

### **QW-4: Color Picker Enhancement** ⏱️ 3 hours
**Status:** 🔴 Not Started

Add recent colors and better color picker UI.

**Files:** `src/components/ui/ColorPicker.tsx` (new)

---

## 📈 Success Metrics

### **Feature Completion**
- ✅ P1 Features: 0/6 complete (0%)
- ⏳ P2 Features: 0/3 complete (0%)
- ⏳ P3 Features: 0/2 complete (0%)

### **Competitive Parity**
- Current parity: ~60% (core features match)
- Target parity: 95% (match + exceed)

### **Unique Value Props**
- ✅ File attachments
- ✅ Minimap
- ⏳ AI features (planned)
- ⏳ Live data (planned)

---

## 🛠️ Development Guidelines

### **Code Quality Standards**
- All new features must have TypeScript types
- Extract reusable logic to `src/lib/`
- Keep components under 300 lines
- Write tests for utility functions
- Document public APIs

### **Performance Targets**
- 60 FPS rendering with 1000+ elements
- < 100ms interaction latency
- < 2s full canvas export
- < 50 KB bundle size increase per feature

### **Accessibility**
- All tools accessible via keyboard
- ARIA labels for buttons
- Focus indicators
- Screen reader support for canvas state

---

## 📝 Notes & Decisions

### **2025-10-18: Initial Roadmap Created**
- Identified 6 P1 features to match Excalidraw
- Defined 2 unique AI features for differentiation
- Targeted Month 1-2 for essential parity

### **Design Decisions:**
- Use existing Yjs infrastructure for grouping
- AI features will use external API (OpenAI/Claude)
- Templates stored as JSON in repo
- Grid rendering uses CSS backdrop pattern

---

## 🤝 Contributing

To implement a feature:
1. Change status to 🟡 In Progress
2. Create feature branch: `feature/[feature-name]`
3. Update this document with progress notes
4. Submit PR with tests
5. Update status to ✅ Complete

---

**Next Review:** End of Month 1
**Owner:** Development Team
**Last Contributor:** Claude Code
