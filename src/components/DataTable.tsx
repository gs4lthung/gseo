import { useMemo, useRef, useState } from "react";
import {
  type ColumnDef,
  type ColumnPinningState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, Pin } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  rowHeight?: number;
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
  /** Column ids permanently pinned to the left — always visible while scrolling, cannot be unpinned or reordered. */
  pinnedColumns?: string[];
}

export function DataTable<T>({
  data,
  columns,
  rowHeight = 34,
  emptyLabel = "No rows yet",
  onRowClick,
  pinnedColumns = ["url"],
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: pinnedColumns });
  const parentRef = useRef<HTMLDivElement>(null);

  const resolvedColumns = useMemo(
    () =>
      columns.map((col) => {
        const id = col.id ?? (col as { accessorKey?: string }).accessorKey;
        return id && pinnedColumns.includes(id) ? { ...col, enablePinning: false } : col;
      }),
    [columns, pinnedColumns],
  );

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting, columnPinning },
    onSortingChange: setSorting,
    onColumnPinningChange: setColumnPinning,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    enableColumnPinning: true,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 60 },
  });

  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const pinnedStyle = (column: { getIsPinned: () => false | "left" | "right"; getStart: (p?: "left" | "right") => number }) => {
    const pinned = column.getIsPinned();
    if (pinned !== "left") return undefined;
    return { left: column.getStart("left") };
  };
  const isLastLeftPinned = (column: { getIsPinned: () => false | "left" | "right"; getPinnedIndex: () => number }) =>
    column.getIsPinned() === "left" && column.getPinnedIndex() === table.getLeftLeafColumns().length - 1;

  return (
    <div className="h-full overflow-auto rounded-lg ring-1 ring-foreground/10" ref={parentRef}>
      <Table
        containerClassName="contents"
        className="table-fixed border-separate border-spacing-0"
        style={{ width: table.getTotalSize() }}
      >
        <TableHeader className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const pinned = h.column.getIsPinned();
                const locked = pinnedColumns.includes(h.column.id);
                return (
                  <ContextMenu key={h.id}>
                    <ContextMenuTrigger asChild>
                      <TableHead
                        style={{ width: h.getSize(), ...pinnedStyle(h.column) }}
                        className={cn(
                          "relative border-b bg-card",
                          pinned && "sticky z-20",
                          isLastLeftPinned(h.column) && "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]",
                        )}
                      >
                        <span
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 pr-4",
                            h.column.getCanSort() && "cursor-pointer select-none",
                          )}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc" && <ChevronUp className="size-3.5" />}
                          {h.column.getIsSorted() === "desc" && <ChevronDown className="size-3.5" />}
                          {pinned && <Pin className="size-3 text-muted-foreground" aria-label="Pinned" />}
                        </span>
                        {h.column.getCanResize() && (
                          <div
                            onMouseDown={h.getResizeHandler()}
                            onTouchStart={h.getResizeHandler()}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-foreground/20",
                              h.column.getIsResizing() && "bg-foreground/40",
                            )}
                          />
                        )}
                      </TableHead>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {locked ? (
                        <ContextMenuLabel className="text-muted-foreground">
                          Always pinned — can't be unpinned
                        </ContextMenuLabel>
                      ) : (
                        h.column.getCanPin() && (
                          <ContextMenuItem onSelect={() => h.column.pin(pinned ? false : "left")}>
                            <Pin className="size-3.5" />
                            {pinned ? "Unpin column" : "Pin column"}
                          </ContextMenuItem>
                        )
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
          {paddingTop > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} style={{ height: paddingTop, padding: 0 }} />
            </TableRow>
          )}
          {virtualRows.map((vRow) => {
            const row = rows[vRow.index];
            return (
              <TableRow
                key={row.id}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const value = cell.getValue();
                  const pinned = cell.column.getIsPinned();
                  return (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize(), ...pinnedStyle(cell.column) }}
                      title={value === null || value === undefined || value === "" ? undefined : String(value)}
                      className={cn(
                        pinned && "sticky z-10 bg-background",
                        isLastLeftPinned(cell.column) && "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} style={{ height: paddingBottom, padding: 0 }} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
