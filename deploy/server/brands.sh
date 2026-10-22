# Brand registry for the la-zone VPS. Sourced by every server script.
#
# Each brand runs as two PM2 apps ("a" and "b") on two loopback ports. A deploy
# starts the new release on the idle slot, health-checks it, points nginx at it
# and only then stops the old slot — so a bad build never takes a site down.

BRANDS="zonenordiques zoneexpos cflquebec"

ROOT=/srv/la-zone

# brand_port <brand> <slot>
brand_port() {
  case "$1:$2" in
    zonenordiques:a) echo 3001 ;;
    zonenordiques:b) echo 3002 ;;
    zoneexpos:a)     echo 3011 ;;
    zoneexpos:b)     echo 3012 ;;
    cflquebec:a)     echo 3021 ;;
    cflquebec:b)     echo 3022 ;;
    *) return 1 ;;
  esac
}

# The host the app answers on; also sent as Host for health checks and crons.
brand_host() {
  case "$1" in
    zonenordiques) echo www.zonenordiques.com ;;
    zoneexpos)     echo www.zoneexpos.com ;;
    cflquebec)     echo cflquebec.com ;;
    *) return 1 ;;
  esac
}

is_brand() {
  case " $BRANDS " in *" $1 "*) return 0 ;; esac
  return 1
}

live_slot() {
  cat "$ROOT/$1/live" 2>/dev/null || echo none
}
