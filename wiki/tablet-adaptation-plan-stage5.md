# Етап 5: Детальний план адаптації під планшети

**Дата створення:** 2026-05-08  
**Статус:** Планування  
**Мета:** Адаптувати Visual Novel Engine для планшетів (iPad, Android tablets)

---

## 1. Адаптація сітки LegoCanvas під ширші екрани

### Проблема
Поточна реалізація LegoCanvas використовує фіксовані розміри без врахування ширини планшета.

### Рішення
Створити хук `useResponsiveLayout` для визначення типу пристрою та адаптації сітки.

### Файли для змін

#### Новий файл: `hooks/useResponsiveLayout.ts`
```typescript
import { useWindowDimensions, Platform } from 'react-native';

export type DeviceType = 'phone' | 'tablet' | 'desktop';

export interface ResponsiveLayout {
  deviceType: DeviceType;
  isTablet: boolean;
  isLandscape: boolean;
  screenWidth: number;
  screenHeight: number;
  gridColumns: number;
  sidebarWidth: number;
  atomMinSize: number;
  fontSize: number;
  spacing: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  // Tablet detection: width > 768px or both dimensions > 600px
  const isTablet = width >= 768 || (width >= 600 && height >= 600);
  const deviceType: DeviceType = isTablet ? 'tablet' : 'phone';
  
  // Grid columns based on screen width
  let gridColumns = 2;
  if (width >= 1024) gridColumns = 4;
  else if (width >= 768) gridColumns = 3;
  
  // Sidebar width for tablets in landscape
  const sidebarWidth = isTablet && isLandscape ? 320 : 280;
  
  // Minimum atom size (larger on tablets for touch)
  const atomMinSize = isTablet ? 80 : 60;
  
  // Font scaling
  const fontSize = isTablet ? 16 : 14;
  
  // Spacing
  const spacing = isTablet ? 16 : 12;
  
  return {
    deviceType,
    isTablet,
    isLandscape,
    screenWidth: width,
    screenHeight: height,
    gridColumns,
    sidebarWidth,
    atomMinSize,
    fontSize,
    spacing,
  };
}
```

#### Зміни в `components/lego-editor/LegoCanvas.tsx`

Додати адаптивні стилі для canvas:

```typescript
// Імпорти
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

// В компоненті LegoCanvas
const LegoCanvas = ({ atoms, onAtomsChange, selectedAtomId, onAtomSelect }: LegoCanvasProps) => {
  const layout = useResponsiveLayout();
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  // Адаптивні стилі canvas
  const canvasStyle = {
    flex: 1,
    position: 'relative' as const,
    backgroundColor: '#1e293b',
    // Більше padding на планшетах
    padding: layout.isTablet ? 20 : 12,
    // Мінімальна висота для scroll
    minHeight: layout.isTablet ? 600 : 400,
  };
  
  // Розрахунок розміру сітки
  const gridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: layout.spacing,
    // Ширина сітки залежить від кількості колонок
    ...(layout.isTablet && {
      display: 'flex',
      flexDirection: 'row',
    }),
  };
  
  // ... rest of component
};
```

---

## 2. Покращення системи вкладок для планшетів

### Проблема
Поточні вкладки (Canvas/Timeline/Graph) малі для планшетного вводу.

### Рішення
Збільшити розмір кнопок, додати іконки більшого розміру, покращити візуальний фідбек.

### Зміни в `app/(tabs)/lego-editor.tsx`

```typescript
// Додати імпорт
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

// Оновлені стилі вкладок
const styles = StyleSheet.create({
  // ... існуючі стилі
  
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 4,
    gap: 4,
    // Більший padding на планшетах
    ...(layout.isTablet && {
      padding: 6,
      gap: 6,
    }),
  },
  
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    // Більші кнопки для планшетів
    minHeight: layout.isTablet ? 48 : 36,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  
  tabButtonActive: {
    backgroundColor: '#3b82f6',
    // Тінь для активної вкладки
    ...(layout.isTablet && {
      shadowColor: '#3b82f6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
    }),
  },
  
  tabText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500' as const,
    // Більший шрифт на планшетах
    ...(layout.isTablet && {
      fontSize: 16,
    }),
  },
});
```

### Додати Split View для планшетів в landscape

```typescript
// В рендері lego-editor.tsx
const renderContent = () => {
  const { isTablet, isLandscape } = layout;
  
  // Split view для планшетів в landscape
  if (isTablet && isLandscape) {
    return (
      <View style={styles.splitViewContainer}>
        {/* Ліва панель: Canvas */}
        <View style={[styles.splitPane, { flex: 3 }]}>
          <LegoCanvas
            atoms={activeScene?.elements.filter((e): e is AtomBlock => 'snapPoints' in e) || []}
            onAtomsChange={handleAtomsChange}
            selectedAtomId={selectedAtomId}
            onAtomSelect={setSelectedAtomId}
          />
        </View>
        
        {/* Права панель: Timeline або інше */}
        <View style={[styles.splitPane, { flex: 2 }]}>
          {activeTab === 'timeline' && activeScene ? (
            <TimelineEditor sceneId={activeScene.id} />
          ) : (
            <View style={styles.placeholderView}>
              <Text style={styles.placeholderText}>Оберіть вкладку для перегляду</Text>
            </View>
          )}
        </View>
      </View>
    );
  }
  
  // Звичайний вигляд для телефонів та планшетів в portrait
  return (
    <Animated.View style={[styles.workspace, { opacity: fadeAnim }]}>
      {/* ... існуючий код ... */}
    </Animated.View>
  );
};

// Стилі для split view
const splitViewStyles = StyleSheet.create({
  splitViewContainer: {
    flex: 1,
    flexDirection: 'row' as const,
  },
  splitPane: {
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
  },
});
```

---

## 3. Оптимізація TouchableOpacity та жести для планшетного вводу

### Проблема
TouchableOpacity має малий hit area (область натискання) для планшетів. Жести потребують більшої зони захоплення.

### Рішення
Збільшити hitSlop, додати додаткову область для drag-and-drop, покращити haptic feedback.

### Зміни в `components/lego-editor/AtomBlockComponent.tsx`

```typescript
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';

const AtomBlockComponent: React.FC<ComponentProps> = ({ atom, isSelected, onPress }) => {
  const layout = useResponsiveLayout();
  const typeColor = ATOM_TYPE_COLORS[atom.type] || '#000000';
  
  // Збільшений hitSlop для планшетів
  const hitSlop = layout.isTablet 
    ? { top: 10, bottom: 10, left: 10, right: 10 }
    : { top: 5, bottom: 5, left: 5, right: 5 };
  
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={hitSlop}
      style={[
        styles.container, 
        { borderColor: typeColor }, 
        isSelected && styles.selectedContainer,
        // Більші атоми на планшетах
        layout.isTablet && styles.tabletContainer,
      ]}
    >
      {/* ... content ... */}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // ... існуючі стилі
  
  tabletContainer: {
    minWidth: 140,
    minHeight: 80,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});
```

### Зміни в `components/lego-editor/LegoCanvas.tsx` для покращення жестів

```typescript
// В компоненті DraggableAtom
const DraggableAtom = ({ atom, index, allAtoms, canvasSize, isSelected, onDragEnd, onPress }) => {
  const layout = useResponsiveLayout();
  
  // Збільшена зона захоплення для планшетів
  const gestureConfig = {
    hitSlop: layout.isTablet ? 15 : 8,
    enabled: true,
  };
  
  const panGesture = Gesture.Pan()
    .hitSlop(gestureConfig.hitSlop)
    .onBegin(() => {
      runOnJS(setIsDragging)(true);
      scale.value = withSpring(layout.isTablet ? 1.08 : 1.05); // Більше масштабування на планшетах
      // Haptic feedback при початку drag
      if (layout.isTablet) {
        runOnJS(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        })();
      }
    })
    .onUpdate((event) => {
      // ... існуючий код ...
      
      // Збільшена зона snap на планшетах
      const snapThreshold = layout.isTablet ? 30 : 20;
      // Використовувати snapThreshold замість SNAP_THRESHOLD
    });
    
  // ... rest of component
};
```

---

## 4. Підтримка повороту екрану (landscape/portrait)

### Проблема
Додаток не адаптується при повороті екрану.

### Рішення
Використати `useWindowDimensions` для відстеження змін розміру екрану. Додати обробку змін layout.

### Зміни в `app/(tabs)/lego-editor.tsx`

```typescript
import { useWindowDimensions } from 'react-native';

export default function LegoEditorScreen() {
  const { width, height } = useWindowDimensions();
  const layout = useResponsiveLayout();
  const isLandscape = width > height;
  
  // Оновлення при повороті
  useEffect(() => {
    // Оновити розміри canvas при повороті
    // Можна додати перерахунок позицій атомів при необхідності
  }, [width, height]);
  
  // Динамічні стилі контейнера
  const containerStyle = [
    styles.container,
    isLandscape && layout.isTablet && styles.landscapeTabletContainer,
  ];
  
  return (
    <View style={containerStyle}>
      {/* ... content ... */}
    </View>
  );
}

const styles = StyleSheet.create({
  // ... існуючі стилі
  
  landscapeTabletContainer: {
    flexDirection: 'row' as const,
    // Змінити layout для landscape
  },
});
```

### Оновлення `app.json` для підтримки повороту

```json
{
  "expo": {
    "screenOrientation": [
      "portrait",
      "portrait-upside-down",
      "landscape",
      "landscape-left",
      "landscape-right"
    ]
  }
}
```

---

## 5. Зміни в компонентах lego-editor

### 5.1 Оновлення `TimelineEditor.tsx`

Додати адаптивність для планшетів:

```typescript
// В TimelineEditor
const layout = useResponsiveLayout();

const timelineStyle = {
  flex: 1,
  padding: layout.isTablet ? 20 : 12,
};

const timelineItemStyle = [
  styles.timelineItem,
  layout.isTablet && styles.tabletTimelineItem,
];

// В стилях
const stylesheet = StyleSheet.create({
  timelineItem: {
    padding: 12,
    marginBottom: 8,
    // ...
  },
  tabletTimelineItem: {
    padding: 16,
    minHeight: 60,
  },
});
```

### 5.2 Оновлення Sidebar (список сцен)

```typescript
// В lego-editor.tsx, оновити sidebar
const sidebarStyle = [
  styles.sidebar,
  layout.isTablet && {
    width: layout.sidebarWidth,
    minWidth: layout.sidebarWidth,
  },
];

// Збільшені картки сцен для планшетів
const sceneCardStyle = [
  styles.sceneCard,
  layout.isTablet && styles.tabletSceneCard,
];

const sceneCardStyles = StyleSheet.create({
  sceneCard: {
    padding: 12,
    marginBottom: 8,
    // ...
  },
  tabletSceneCard: {
    padding: 16,
    minHeight: 70,
  },
});
```

---

## Чекліст реалізації

### Файли для створення:
- [ ] `hooks/useResponsiveLayout.ts` — хук для визначення типу пристрою

### Файли для оновлення:
- [ ] `app/(tabs)/lego-editor.tsx` — адаптивні вкладки, split view, підтримка повороту
- [ ] `components/lego-editor/LegoCanvas.tsx` — адаптивна сітка, покращені жести
- [ ] `components/lego-editor/AtomBlockComponent.tsx` — збільшені області натискання
- [ ] `components/lego-editor/TimelineEditor.tsx` — адаптивність timeline
- [ ] `app.json` — дозвіл на поворот екрану

### Тести:
- [ ] Додати тести для `useResponsiveLayout`
- [ ] Оновити існуючі тести (144/144 мають проходити)
- [ ] Тестувати на симуляторах iPad/Android tablet

---

## Очікуваний результат

1. **LegoCanvas** адаптується під ширину планшета (3-4 колонки замість 2)
2. **Вкладки** стають більшими, зручними для дотику пальцем
3. **TouchableOpacity** має збільшену область натискання (hitSlop)
4. **Поворот екрану** працює коректно, перебудовується layout
5. **Split View** на планшетах в landscape (canvas + timeline side by side)
6. **Атоми** стають більшими на планшетах (min 80px замість 60px)

---

## Примітки

- Використовується `useWindowDimensions` замість `Dimensions` для автоматичного оновлення при повороті
- Для планшетів порогове значення: ширина >= 768px або обидва виміри >= 600px
- Збережено сумісність з існуючими анімаціями (Reanimated)
- Всі зміни мають пройти тести (vitest)
