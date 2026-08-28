"use client";
import { useEffect, useMemo, useState } from "react";
import { InboxIcon, SearchIcon, SearchXIcon, WifiOffIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import styles from "./non-standard.module.css";
import { useDepthSnapshot } from "../../components/ds/useDepthSnapshot";

const PAGE_SIZE = 8;

export default function NonStandardPage() {
  const { data, loading, error } = useDepthSnapshot();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.nonStandard;
    return data.nonStandard.filter(
      (r) => r.tokenSymbol.toLowerCase().includes(q) || r.token.toLowerCase().includes(q),
    );
  }, [data, query]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Query changes (or the underlying data reloading) can leave `page` past the new last page.
  useEffect(() => {
    setPage(1);
  }, [query]);

  const hasData = !loading && !error && !!data;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <h1>Non-standard flow</h1>
        <p className={styles.intro}>
          Deposits outside the standard denominations. Easier to trace, no crowd to hide in.
        </p>
      </header>

      {hasData && data.nonStandard.length > 0 && (
        <InputGroup className={styles.search}>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            placeholder="Search token or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search non-standard deposits"
          />
        </InputGroup>
      )}

      {loading && (
        <div className={styles.loadingStack}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className={styles.rowSkeleton} />
          ))}
        </div>
      )}

      {!loading && error && (
        <Empty className={styles.empty}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WifiOffIcon />
            </EmptyMedia>
            <EmptyTitle>Couldn&apos;t load flow data</EmptyTitle>
            <EmptyDescription>This is usually a network hiccup. Reload to try again.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {hasData && data.nonStandard.length === 0 && (
        <Empty className={styles.empty}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No non-standard deposits</EmptyTitle>
            <EmptyDescription>Everything so far has gone through a standard denomination.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {hasData && data.nonStandard.length > 0 && rows.length === 0 && (
        <Empty className={styles.empty}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>Try a different token or address.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {hasData && rows.length > 0 && (
        <>
          <div className={styles.tableCard}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Non-standard deposits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r.token}>
                    <TableCell>{r.tokenSymbol}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.depth.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={page === 1}
                    className={`${styles.pageLink}${page === 1 ? " pointer-events-none opacity-50" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                  />
                </PaginationItem>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <PaginationItem key={n}>
                    <PaginationLink
                      href="#"
                      isActive={n === page}
                      className={styles.pageLink}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(n);
                      }}
                    >
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={page === pageCount}
                    className={`${styles.pageLink}${page === pageCount ? " pointer-events-none opacity-50" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(pageCount, p + 1));
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}
    </div>
  );
}
