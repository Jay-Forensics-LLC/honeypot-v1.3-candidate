import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import WidgetFrame from './WidgetFrame';
import { getWidget } from './widgetRegistry';

export default function DashboardGrid({ 
  gridItems, 
  onGridChange, 
  editMode, 
  onWidgetClick,
  onWidgetRemove,
  globalFilters 
}) {
  const handleDragEnd = (result) => {
    if (!result.destination || !editMode) return;

    const items = Array.from(gridItems);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    onGridChange(items);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="dashboard-grid">
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="grid grid-cols-12 gap-4 p-4"
          >
            {gridItems.map((item, index) => {
              const widgetDef = getWidget(item.widgetKey);
              if (!widgetDef) return null;

              return (
                <Draggable
                  key={item.widgetKey}
                  draggableId={item.widgetKey}
                  index={index}
                  isDragDisabled={!editMode || item.locked}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`col-span-${item.w || widgetDef.defaultSize.w}`}
                      style={{
                        ...provided.draggableProps.style,
                        gridRowEnd: `span ${item.h || widgetDef.defaultSize.h}`
                      }}
                    >
                      <WidgetFrame
                        widget={widgetDef}
                        editMode={editMode}
                        isDragging={snapshot.isDragging}
                        onRemove={() => onWidgetRemove(item.widgetKey)}
                        onClick={() => onWidgetClick(item)}
                        globalFilters={globalFilters}
                        localSettings={item.settings}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}