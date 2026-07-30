"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

async function getBrowserClient(): Promise<SupabaseClient> {
  if (browserClient) return browserClient;
  const { createSupabaseBrowserClient } = await import("@/lib/db/client");
  browserClient = createSupabaseBrowserClient();
  return browserClient;
}

export type PublicEmployee = {
  id: string;
  full_name: string;
  title: string | null;
  department: string | null;
};

type NamePickerProps = {
  fieldName: "employeeId" | "handoverEmployeeId";
  label: string;
  error?: string;
  includeProfileFields?: boolean;
};

export default function NamePicker({
  fieldName,
  label,
  error,
  includeProfileFields = false,
}: NamePickerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PublicEmployee | null>(null);
  const [results, setResults] = useState<PublicEmployee[]>([]);
  const [pending, setPending] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (selected?.full_name === term || term.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPending(true);
      setSearchError("");
      try {
        const supabase = await getBrowserClient();
        if (controller.signal.aborted) return;
        const { data, error: rpcError } = await supabase
          .rpc("lg_search_employees", { p_query: term })
          .abortSignal(controller.signal);

        if (controller.signal.aborted) return;
        if (rpcError) {
          setResults([]);
          setSearchError("Chưa tìm được danh sách. Thử lại sau ít phút.");
        } else {
          setResults((data ?? []) as PublicEmployee[]);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchError(
          cause instanceof Error
            ? `Chưa tìm được danh sách: ${cause.message}`
            : "Chưa tìm được danh sách. Thử lại sau ít phút.",
        );
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  function choose(employee: PublicEmployee) {
    setSelected(employee);
    setQuery(employee.full_name);
    setResults([]);
    setSearchError("");
  }

  const errorId = `${fieldName}-error`;
  const helpId = `${fieldName}-help`;

  return (
    <div className="form-field">
      <label htmlFor={`${fieldName}-search`}>{label}</label>
      <input
        id={`${fieldName}-search`}
        className={error || searchError ? "field-control field-control--error" : "field-control"}
        type="search"
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setSelected(null);
          setResults([]);
          setPending(nextQuery.trim().length >= 2);
          setSearchError("");
        }}
        placeholder="Gõ ít nhất 2 ký tự"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-describedby={`${helpId}${error || searchError ? ` ${errorId}` : ""}`}
        aria-expanded={results.length > 0}
        aria-controls={`${fieldName}-results`}
      />
      <input name={fieldName} type="hidden" value={selected?.id ?? ""} />
      {includeProfileFields ? (
        <>
          <input name="employeeName" type="hidden" value={selected?.full_name ?? ""} />
          <input name="employeeTitle" type="hidden" value={selected?.title ?? ""} />
          <input name="employeeDepartment" type="hidden" value={selected?.department ?? ""} />
        </>
      ) : null}

      <span id={helpId} className="field-help">
        Chọn đúng một dòng trong kết quả. Không nhập mã CBNV.
      </span>

      {pending ? (
        <p className="picker-status" aria-live="polite">
          Đang tìm...
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul id={`${fieldName}-results`} className="picker-results" aria-label="Kết quả tìm tên">
          {results.map((employee) => (
            <li key={employee.id}>
              <button type="button" onClick={() => choose(employee)}>
                <strong>{employee.full_name}</strong>
                <span>
                  {[employee.title, employee.department].filter(Boolean).join(" | ") ||
                    "Chưa có chức vụ và phòng ban"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!pending && query.trim().length >= 2 && !selected && results.length === 0 && !searchError ? (
        <p className="picker-status" aria-live="polite">
          Không thấy tên phù hợp.
        </p>
      ) : null}

      {selected ? (
        <p className="picker-selected" aria-live="polite">
          Đã chọn <strong>{selected.full_name}</strong>
          <span>
            {[selected.title, selected.department].filter(Boolean).join(" | ") ||
              "Chưa có chức vụ và phòng ban"}
          </span>
        </p>
      ) : null}

      {error || searchError ? (
        <p id={errorId} className="field-error" role="alert">
          {error || searchError}
        </p>
      ) : null}
    </div>
  );
}
