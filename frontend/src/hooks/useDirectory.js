import { useCallback, useEffect, useRef, useState } from "react";
import { getScanStatus, getStats, listGroups } from "@/lib/api";

const POLL_INTERVAL_MS = 2500;

export default function useDirectory(region) {
  const [groups, setGroups] = useState([]);
  const [stats, setStats] = useState(null);
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);
  const isScanning = !!scan?.is_running;

  const fetchAll = useCallback(async () => {
    try {
      const [gs, st, sc] = await Promise.all([listGroups(region), getStats(), getScanStatus()]);
      setGroups(gs);
      setStats(st);
      setScan(sc);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (isScanning) {
      pollRef.current = setInterval(fetchAll, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isScanning, fetchAll]);

  return { groups, stats, scan, loading, isScanning, fetchAll };
}
