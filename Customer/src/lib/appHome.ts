/** GET /app/home — single request for the whole home screen; cached on-device (stale-while-revalidate) for instant paint. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";

const KEY = (city: string) => `azo_app_home:${(city || "").toLowerCase()}`;

export function useAppHome(city: string) {
  const [cached, setCached] = useState<any>(null);
  const [cacheChecked, setCacheChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY(city)).then((raw) => { if (alive) { if (raw) { try { setCached(JSON.parse(raw)); } catch {} } setCacheChecked(true); } }).catch(() => alive && setCacheChecked(true));
    return () => { alive = false; };
  }, [city]);
  const q = useQuery({
    queryKey: ["app-home", city],
    queryFn: async () => {
      const d = await api.get<any>(`/app/home${city ? `?city=${encodeURIComponent(city)}` : ""}`);
      AsyncStorage.setItem(KEY(city), JSON.stringify(d)).catch(() => {});
      return d;
    },
    staleTime: 45_000,
    refetchInterval: 120_000,
  });
  const data = q.data || cached;
  return { data, loading: !data && (!cacheChecked || q.isLoading), error: q.isError && !data, refetch: q.refetch, refreshing: q.isFetching && !!data };
}
