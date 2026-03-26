"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_MEMBERS_DATA } from "./defaults";
import type {
  FavoriteHotel,
  FavoriteRestaurant,
  MemberProfile,
  MembersData,
  SavedTrip,
} from "./types";

const STORAGE_KEY = "oltra_members_data_v1";

type MembersContextValue = {
  isReady: boolean;
  profile: MemberProfile;
  trips: SavedTrip[];
  favoriteHotels: FavoriteHotel[];
  favoriteRestaurants: FavoriteRestaurant[];
  setProfile: (profile: MemberProfile) => void;
  setTrips: (trips: SavedTrip[]) => void;
  setFavoriteHotels: (items: FavoriteHotel[]) => void;
  setFavoriteRestaurants: (items: FavoriteRestaurant[]) => void;
  resetAll: () => void;
};

const MembersDataContext = createContext<MembersContextValue | null>(null);

function readStoredMembersData(): MembersData {
  if (typeof window === "undefined") return DEFAULT_MEMBERS_DATA;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MEMBERS_DATA;

    const parsed = JSON.parse(raw) as Partial<MembersData>;

    return {
      profile: parsed.profile ?? DEFAULT_MEMBERS_DATA.profile,
      trips: parsed.trips ?? DEFAULT_MEMBERS_DATA.trips,
      favoriteHotels:
        parsed.favoriteHotels ?? DEFAULT_MEMBERS_DATA.favoriteHotels,
      favoriteRestaurants:
        parsed.favoriteRestaurants ?? DEFAULT_MEMBERS_DATA.favoriteRestaurants,
    };
  } catch {
    return DEFAULT_MEMBERS_DATA;
  }
}

export function MembersDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);
  const [profile, setProfile] = useState<MemberProfile>(
    DEFAULT_MEMBERS_DATA.profile
  );
  const [trips, setTrips] = useState<SavedTrip[]>(DEFAULT_MEMBERS_DATA.trips);
  const [favoriteHotels, setFavoriteHotels] = useState<FavoriteHotel[]>(
    DEFAULT_MEMBERS_DATA.favoriteHotels
  );
  const [favoriteRestaurants, setFavoriteRestaurants] = useState<
    FavoriteRestaurant[]
  >(DEFAULT_MEMBERS_DATA.favoriteRestaurants);

  useEffect(() => {
    const stored = readStoredMembersData();
    setProfile(stored.profile);
    setTrips(stored.trips);
    setFavoriteHotels(stored.favoriteHotels);
    setFavoriteRestaurants(stored.favoriteRestaurants);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === "undefined") return;

    const next: MembersData = {
      profile,
      trips,
      favoriteHotels,
      favoriteRestaurants,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [isReady, profile, trips, favoriteHotels, favoriteRestaurants]);

  const value = useMemo<MembersContextValue>(
    () => ({
      isReady,
      profile,
      trips,
      favoriteHotels,
      favoriteRestaurants,
      setProfile,
      setTrips,
      setFavoriteHotels,
      setFavoriteRestaurants,
      resetAll: () => {
        setProfile(DEFAULT_MEMBERS_DATA.profile);
        setTrips(DEFAULT_MEMBERS_DATA.trips);
        setFavoriteHotels(DEFAULT_MEMBERS_DATA.favoriteHotels);
        setFavoriteRestaurants(DEFAULT_MEMBERS_DATA.favoriteRestaurants);
      },
    }),
    [isReady, profile, trips, favoriteHotels, favoriteRestaurants]
  );

  return (
    <MembersDataContext.Provider value={value}>
      {children}
    </MembersDataContext.Provider>
  );
}

export function useMembersData() {
  const ctx = useContext(MembersDataContext);

  if (!ctx) {
    throw new Error("useMembersData must be used inside MembersDataProvider");
  }

  return ctx;
}