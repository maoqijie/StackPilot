import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { normalizeTableValue } from "../../utils/data";

type TableColumn<T> = {
  key: string;
  label: string;
  width?: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | boolean | null | undefined;
};

type MobileCardRenderer<T> = (row: T) => React.ReactNode;

function DataTable<T>({
  columns,
  rows,
  emptyText,
  getRowKey,
  mobileCard,
}: {
  columns: Array<TableColumn<T>>;
  rows: T[];
  emptyText: string;
  getRowKey: (row: T) => string;
  mobileCard?: MobileCardRenderer<T>;
}) {
  const sortableColumns = columns.filter((column) => Boolean(column.sortValue));
  const [sortState, setSortState] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const activeSortColumn = sortState ? sortableColumns.find((column) => column.key === sortState.key) : undefined;
  const sortedRows = activeSortColumn
    ? [...rows].sort((left, right) => {
        return compareTableValues(
          tableSortValue(left, activeSortColumn),
          tableSortValue(right, activeSortColumn),
          sortState?.direction ?? "asc",
        );
      })
    : rows;
  const toggleSort = (column: TableColumn<T>) => {
    if (!column.sortValue) return;
    setSortState((current) => (
      current?.key !== column.key
        ? { key: column.key, direction: "asc" }
        : current.direction === "asc"
          ? { key: column.key, direction: "desc" }
          : null
    ));
  };
  return (
    <div className="module-table-wrap">
      <table className="mini-table module-table">
        <colgroup>
          {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue);
              const isActive = sortState?.key === column.key;
              const sortStatus = isActive ? (sortState.direction === "asc" ? "升序" : "降序") : "未排序";
              return (
                <th key={column.key} aria-sort={sortable ? (isActive ? (sortState.direction === "asc" ? "ascending" : "descending") : "none") : undefined}>
                  {sortable ? (
                    <button
                      className="table-sort-button"
                      type="button"
                      aria-label={`${column.label}，${sortStatus}，点击切换排序`}
                      onClick={() => toggleSort(column)}
                    >
                      <span>{column.label}</span>
                      <ChevronsUpDown size={13} aria-hidden="true" />
                      {isActive && <em>{sortState.direction === "asc" ? "升序" : "降序"}</em>}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={getRowKey(row)}>{columns.map((column) => <td key={column.key} data-label={column.label}>{column.render(row)}</td>)}</tr>
          ))}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty-row" role="status" aria-live="polite">{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
      {sortableColumns.length > 0 && (
        <div className="module-card-sort" aria-label="卡片排序">
          <span>排序</span>
          {sortableColumns.map((column) => {
            const isActive = sortState?.key === column.key;
            const sortStatus = isActive ? (sortState.direction === "asc" ? "升序" : "降序") : "未排序";
            return (
              <button
                key={column.key}
                type="button"
                aria-pressed={isActive}
                aria-label={`${column.label}，${sortStatus}，点击切换卡片排序`}
                onClick={() => toggleSort(column)}
              >
                {column.label}
                {isActive && <em>{sortState.direction === "asc" ? "升序" : "降序"}</em>}
              </button>
            );
          })}
        </div>
      )}
      <div className="module-card-list">
        {sortedRows.map((row) => (
          <article className="module-card-row" key={getRowKey(row)}>
            {mobileCard ? mobileCard(row) : columns.map((column) => (
                <div className="module-card-cell" key={column.key}>
                  <span>{column.label}</span>
                  <div>{column.render(row)}</div>
                </div>
              ))}
          </article>
        ))}
        {sortedRows.length === 0 && <div className="module-card-empty" role="status" aria-live="polite">{emptyText}</div>}
      </div>
    </div>
  );
}

function tableSortValue<T>(row: T, column: TableColumn<T>) {
  return column.sortValue?.(row);
}

function compareTableValues(left: string | number | boolean | null | undefined, right: string | number | boolean | null | undefined, direction: "asc" | "desc") {
  const leftValue = normalizeTableValue(left);
  const rightValue = normalizeTableValue(right);
  const leftInvalid = leftValue === null;
  const rightInvalid = rightValue === null;
  if (leftInvalid || rightInvalid) {
    if (leftInvalid && rightInvalid) return 0;
    return leftInvalid ? 1 : -1;
  }
  const result = typeof leftValue === "number" && typeof rightValue === "number"
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  return direction === "desc" ? -result : result;
}

export { DataTable };
export type { TableColumn, MobileCardRenderer };
