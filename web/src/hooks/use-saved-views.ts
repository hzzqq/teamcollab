"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateSavedViewRequest, UpdateSavedViewRequest } from "@/lib/api-types";

export function viewsQueryKey(teamId: string) {
  return ["views", teamId];
}

export function useSavedViews(teamId: string) {
  return useQuery({
    queryKey: viewsQueryKey(teamId),
    queryFn: () => api.listViews(teamId),
    enabled: Boolean(teamId),
  });
}

export function useCreateView(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateSavedViewRequest) => api.createView(teamId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsQueryKey(teamId) }),
  });
}

export function useUpdateView(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ viewId, req }: { viewId: string; req: UpdateSavedViewRequest }) =>
      api.updateView(teamId, viewId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsQueryKey(teamId) }),
  });
}

export function useDeleteView(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (viewId: string) => api.deleteView(teamId, viewId),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewsQueryKey(teamId) }),
  });
}
