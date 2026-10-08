import json, os, time, urllib.parse, urllib.request
from datetime import datetime, timezone

API_KEY = os.environ.get('ODDS_API_KEY')
BASE = 'https://api.the-odds-api.com/v4'
SPORTS = [
    'aussierules_afl','rugby_nrl','basketball_nba','basketball_nbl',
    'americanfootball_nfl','baseball_mlb','icehockey_nhl','soccer_epl',
    'tennis_atp','tennis_wta'
]
REGION = os.environ.get('ODDS_REGION', 'au')
MARKETS = os.environ.get('ODDS_MARKETS', 'h2h,spreads,totals')
OUT = 'data/edge-data.json'


def get(path, params):
    q = urllib.parse.urlencode(params)
    url = f'{BASE}{path}?{q}'
    req = urllib.request.Request(url, headers={'User-Agent':'Edge-Lab-Sports/0.2'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def implied(price):
    try:
        p=float(price)
        return 1/p if p > 1 else None
    except Exception:
        return None


def normalise_market(bookmakers, market_key):
    rows=[]
    for b in bookmakers or []:
        for m in b.get('markets', []):
            if m.get('key') != market_key: continue
            for o in m.get('outcomes', []):
                p=implied(o.get('price'))
                if p is not None:
                    rows.append({'bookmaker':b.get('title'), 'selection':o.get('name'), 'price':o.get('price'), 'implied_probability':p})
    return rows


def main():
    payload={'schema_version':'0.2.0','updated_at':datetime.now(timezone.utc).isoformat(),'source':'The Odds API','live':False,'events':[],'markets':[],'edges':[],'movers':[],'racing':[],'stats':{'events':0,'markets':0,'edges':0,'avg_edge':None,'sports':0,'meetings':0}}
    if not API_KEY:
        json.dump(payload,open(OUT,'w'),separators=(',',':'))
        print('ODDS_API_KEY not configured; wrote empty live schema.')
        return
    seen_events=set(); sports_seen=set(); edges=[]
    for sport in SPORTS:
        try:
            events=get(f'/sports/{sport}/odds', {'apiKey':API_KEY,'regions':REGION,'markets':MARKETS,'oddsFormat':'decimal'})
        except Exception as e:
            print(f'{sport}: {e}')
            continue
        for ev in events:
            eid=ev.get('id')
            if not eid: continue
            sports_seen.add(sport)
            seen_events.add(eid)
            event={'id':eid,'sport':sport,'league':ev.get('sport_title'),'commence_time':ev.get('commence_time'),'home':ev.get('home_team'),'away':ev.get('away_team')}
            payload['events'].append(event)
            by_market={}
            for b in ev.get('bookmakers',[]):
                for m in b.get('markets',[]):
                    key=m.get('key')
                    if not key: continue
                    by_market.setdefault(key,[])
                    for o in m.get('outcomes',[]):
                        pr=o.get('price'); ip=implied(pr)
                        if ip is not None:
                            by_market[key].append({'bookmaker':b.get('title'),'selection':o.get('name'),'price':pr,'implied_probability':ip,'point':o.get('point')})
            for mk, rows in by_market.items():
                if not rows: continue
                best={}
                for r in rows:
                    s=r['selection']
                    if s not in best or float(r['price'])>float(best[s]['price']): best[s]=r
                # Market probability is de-vigged across the best-price selection set when complete.
                raw=[float(x['implied_probability']) for x in best.values()]
                total=sum(raw)
                for sel,r in best.items():
                    fair=(r['implied_probability']/total) if total>0 else None
                    market_id=f"{eid}:{mk}:{sel}"
                    payload['markets'].append({'id':market_id,'event_id':eid,'market':mk,'selection':sel,'best_price':r['price'],'best_bookmaker':r['bookmaker'],'raw_implied_probability':r['implied_probability'],'market_fair_probability':fair,'model_probability':None,'edge_probability_points':None,'ev':None,'confidence':None,'status':'UNMODELLED'})
    payload['stats']['events']=len(seen_events); payload['stats']['markets']=len(payload['markets']); payload['stats']['sports']=len(sports_seen); payload['live']=True
    json.dump(payload,open(OUT,'w'),separators=(',',':'),ensure_ascii=False)
    print(f"Wrote {OUT}: {len(payload['events'])} events, {len(payload['markets'])} markets")

if __name__=='__main__': main()
