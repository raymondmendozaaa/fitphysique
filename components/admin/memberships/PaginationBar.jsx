'use client';
import React from 'react';

export default function PaginationBar({
  page, pageCount, pageSize, total,
  startIdx, endIdx,
  setPage, setPageSize,
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="text-sm text-gray-300">
        Showing <span className="text-yellow-400">{total === 0 ? 0 : startIdx + 1}</span>
        &nbsp;–&nbsp;<span className="text-yellow-400">{endIdx}</span>
        &nbsp;of&nbsp;<span className="text-yellow-400">{total}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 disabled:opacity-40"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="Previous page"
        >
          ‹ Prev
        </button>
        <div className="text-sm text-gray-300">
          Page <span className="text-yellow-400">{page}</span> / <span className="text-yellow-400">{pageCount}</span>
        </div>
        <button
          className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-200 disabled:opacity-40"
          onClick={() => setPage(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          title="Next page"
        >
          Next ›
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="text-sm text-gray-300">Rows per page</label>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-white"
          title="Rows per page"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
    </div>
  );
}