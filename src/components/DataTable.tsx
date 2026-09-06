import { useRef, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  rowHeight?: number;
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  data,
  columns,
  rowHeight = 34,
  emptyLabel = "No rows yet",
  onRowClick,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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

  return (
    <div className="h-full overflow-auto rounded-lg ring-1 ring-foreground/10" ref={parentRef}>
      <Table className="border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => (
                <TableHead
                  key={h.id}
                  style={{ width: h.getSize() }}
                  onClick={h.column.getToggleSortingHandler()}
                  className={cn("border-b bg-card", h.column.getCanSort() && "cursor-pointer select-none")}
                >
                  <span className="inline-flex items-center gap-1">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" && <ChevronUp className="size-3.5" />}
                    {h.column.getIsSorted() === "desc" && <ChevronDown className="size-3.5" />}
                  </span>
                </TableHead>
              ))}
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
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
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
