(function(){let e=`https://cdn.jsdelivr.net/pyodide/v0.26.4/full/`,t=String.raw`
import builtins, sys, os, json, linecache, traceback, base64, io, warnings
os.environ['MPLBACKEND'] = 'Agg'
# 跟舊版一樣:中文字型缺字的 Glyph 警告不印;pandas 在 Pyodide 會提醒 Pyarrow,對學生沒有意義
warnings.filterwarnings('ignore', message='Glyph')
warnings.filterwarnings('ignore', message=r'\s*Pyarrow will become a required dependency')

class PylStop(BaseException):
    pass

# 輸入資料用完,分三次:
#   第 1 次丟 EOFError(跟真的 Python 一樣,except EOFError: break「讀到沒有為止」的寫法照常結束)
#   第 2 次丟 PylWait(BaseException:學生常寫 except Exception: 重問,擋不住它,程式停在等輸入)
#   第 3 次丟 PylStop 並讓下一行就撞到行數上限(裸 except: 連 PylWait 都擋住,不停下來會一直重問、塞滿主控台)
class PylWait(BaseException):
    pass

_pyl = {'stdin': [], 'i': 0, 'waiting': 0, 'prompt': '', 'lines': 0, 'max': 0, 'imgs': [], 'quiet': False, 'miss': 0, 'eof': None}

def _pyl_input(p=''):
    p = str(p)
    if _pyl['i'] < len(_pyl['stdin']):
        r = _pyl['stdin'][_pyl['i']]
        _pyl['i'] += 1
        if not _pyl['quiet']:          # 比對 stdout 的測資:只比 print 印的,input 的提示和輸入不算
            print(p + r)
        return r
    # 輸入資料用完:記下是第幾個輸入、提示是什麼,畫面上請使用者補一行再重跑
    _pyl['waiting'] = _pyl['i'] + 1
    _pyl['prompt'] = p
    _pyl['miss'] += 1
    if _pyl['miss'] == 1:
        _pyl['eof'] = EOFError('EOF when reading a line')
        raise _pyl['eof']
    if _pyl['miss'] >= 3:
        _pyl_arm()
        raise PylStop()
    raise PylWait()

builtins.input = _pyl_input

def _pyl_line(frame, event, arg):
    if event == 'line':
        _pyl['lines'] += 1
        if _pyl['lines'] > _pyl['max']:
            raise PylStop()
    return _pyl_line

# 讓學生程式的下一行就丟 PylStop(被 except: 接住也一樣,接住後的那一行就停)。
# trace 函式丟過例外後 Python 會把追蹤整個關掉,所以這裡重新掛上:新的 frame 用 settrace,執行中的 <exec> frame 直接設 f_trace
def _pyl_arm():
    _pyl['max'] = _pyl['lines']
    sys.settrace(_pyl_trace)
    f = sys._getframe(1)
    while f is not None:
        if f.f_code.co_filename == '<exec>':
            f.f_trace = _pyl_line
        f = f.f_back

def _pyl_trace(frame, event, arg):
    # 只數學生程式(<exec>)的行;函式庫裡的 frame 不追,省時間
    return _pyl_line if frame.f_code.co_filename == '<exec>' else None

def _pyl_show(*a, **k):
    import matplotlib.pyplot as plt
    for n in plt.get_fignums():
        buf = io.BytesIO()
        plt.figure(n).savefig(buf, format='png', dpi=90)
        _pyl['imgs'].append(base64.b64encode(buf.getvalue()).decode())
    plt.close('all')

def _pyl_mpl():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.show = _pyl_show

# 快照:每次執行完還原,學生改了 builtins.sum / sys.modules['json'] 不會留到下一次
_pyl_b = dict(builtins.__dict__)
_pyl_m = dict(sys.modules)
_pyl_s = (sys.stdout, sys.stderr, sys.stdin, list(sys.path), list(sys.argv), sys.getrecursionlimit(), os.getcwd())
_pyl_w = list(warnings.filters)

def _pyl_keep(name, mod):
    # 新 import 的標準函式庫 / 套件留著(不然每次都要重新 import matplotlib);學生自己塞的刪掉
    if name in sys.builtin_module_names:
        return True
    f = getattr(mod, '__file__', None) or ''
    if f.startswith('/lib/'):
        return True
    spec = getattr(mod, '__spec__', None)
    return getattr(spec, 'origin', None) == 'frozen'

def _pyl_restore():
    sys.settrace(None)
    builtins.__dict__.clear()
    builtins.__dict__.update(_pyl_b)
    for k in list(sys.modules):
        m = sys.modules[k]
        if k in _pyl_m:
            if m is not _pyl_m[k]:
                sys.modules[k] = _pyl_m[k]
        elif not _pyl_keep(k, m):
            del sys.modules[k]
    for k, m in _pyl_m.items():
        if k not in sys.modules:
            sys.modules[k] = m
    sys.stdout, sys.stderr, sys.stdin = _pyl_s[0], _pyl_s[1], _pyl_s[2]
    sys.path[:] = _pyl_s[3]
    sys.argv[:] = _pyl_s[4]
    sys.setrecursionlimit(_pyl_s[5])
    warnings.filters[:] = _pyl_w
    try:
        os.chdir(_pyl_s[6])
    except OSError:
        pass
    if 'matplotlib.pyplot' in sys.modules:
        import matplotlib, matplotlib.pyplot as plt
        plt.close('all')
        matplotlib.rcdefaults()

def _pyl_err(e):
    # 只留學生程式的 frame(不讓使用者看到這裡的包裝)
    # n = 停下來時程式在等第幾個輸入(0 = 不是輸入用完造成的,是真的跑太多行)
    if isinstance(e, PylStop):
        return {'type': 'PylStop', 'msg': '', 'text': '', 'line': None, 'n': _pyl['waiting'] if _pyl['miss'] >= 3 else 0}
    te = traceback.TracebackException(type(e), e, e.__traceback__)
    te.stack = traceback.StackSummary.from_list([f for f in te.stack if f.filename == '<exec>'])
    line = te.stack[-1].lineno if len(te.stack) else getattr(e, 'lineno', None)
    # 輸入用完的那個 EOFError 沒被接住:跟 PylWait 一樣是「在等輸入」,不是程式寫錯
    if isinstance(e, PylWait) or (_pyl['eof'] is not None and e is _pyl['eof']):
        return {'type': 'PylWait', 'msg': _pyl['prompt'].strip(), 'text': '', 'line': line, 'n': _pyl['waiting']}
    msg = e.msg if isinstance(e, SyntaxError) else str(e)
    return {'type': type(e).__name__, 'msg': str(msg), 'text': ''.join(te.format()).rstrip(), 'line': line}

def _pyl_norm(s):
    # 比對前統一(build.py 的 norm_out 同一套):換行一律 \n、每行去行尾空白、去掉最後的空行
    lines = [x.rstrip() for x in str(s).replace('\r\n', '\n').replace('\r', '\n').split('\n')]
    while lines and lines[-1] == '':
        lines.pop()
    return '\n'.join(lines)

def _pyl_lines(s):
    a = str(s or '').replace('\r\n', '\n').replace('\r', '\n').split('\n')
    if a and a[-1] == '':
        a.pop()
    return a

def _pyl_check(code, tests, max_lines):
    # stdout 型測資 [{stdin, stdout}]:每筆用新的 dict 各跑一次;stdout 是 None(預測輸出題)就只回傳實際輸出
    out = []
    for t in tests:
        _pyl.update(stdin=_pyl_lines(t.get('stdin')), i=0, waiting=0, prompt='', lines=0, max=max_lines, quiet=True, miss=0, eof=None)
        buf, err, old = io.StringIO(), None, sys.stdout
        try:
            comp = compile(code, '<exec>', 'exec')
            sys.stdout = buf
            sys.settrace(_pyl_trace)
            try:
                exec(comp, {'__name__': '__main__', '__builtins__': builtins})
            finally:
                sys.settrace(None)
                sys.stdout = old
        except SystemExit:
            pass
        except BaseException as e:
            err = _pyl_err(e)
        r = {'stdin': t.get('stdin') or '', 'got': _pyl_norm(buf.getvalue()), 'error': err}
        if t.get('stdout') is not None:
            r['expect'] = _pyl_norm(t['stdout'])
            r['ok'] = err is None and r['got'] == r['expect']
        out.append(r)
    _pyl['quiet'] = False
    return out

def _pyl_run(code, stdin, tests_json, max_lines, seed):
    _pyl.update(stdin=list(stdin), i=0, waiting=0, prompt='', lines=0, max=max_lines, imgs=[], quiet=False, miss=0, eof=None)
    linecache.cache['<exec>'] = (len(code), None, code.splitlines(True), '<exec>')
    ns = {'__name__': '__main__', '__builtins__': builtins}
    res = {'error': None, 'tests': None, 'exit': None}
    tests = json.loads(tests_json) if tests_json else []
    if tests and all('stdout' in t for t in tests):
        # stdout 型測資:不跑一般執行,直接逐筆跑
        try:
            res['tests'] = _pyl_check(code, tests, max_lines)
        finally:
            _pyl_restore()
        res.update(waiting=0, prompt='', lines=_pyl['lines'], imgs=[])
        return json.dumps(res)
    try:
        if 'matplotlib' in code:
            _pyl_mpl()
        if seed is not None:
            import random
            random.seed(seed)
        comp = compile(code, '<exec>', 'exec')
        sys.settrace(_pyl_trace)
        try:
            exec(comp, ns)
            if tests:
                out = []
                for t in tests:
                    try:
                        got = repr(eval(t['call'], ns))
                        out.append({'call': t['call'], 'expect': t['expect'], 'got': got, 'ok': got == t['expect']})
                    except Exception as e2:
                        out.append({'call': t['call'], 'expect': t['expect'], 'got': type(e2).__name__ + ': ' + str(e2), 'ok': False, 'error': True})
                res['tests'] = out
        finally:
            sys.settrace(None)
        if 'matplotlib.pyplot' in sys.modules:
            _pyl_show()
    except SystemExit as e:
        # sys.exit() / raise SystemExit:程式自己要結束,不是錯誤;給字串的話照 Python 的做法印出來
        c = e.code
        if isinstance(c, str):
            print(c, file=sys.stderr)
        res['exit'] = 0 if c is None else c if isinstance(c, int) else 1
    except BaseException as e:
        res['error'] = _pyl_err(e)
    finally:
        try:
            sys.stdout.flush()
        except Exception:
            pass
        _pyl_restore()
    # 只有「停在等輸入」才回報 waiting;程式自己接住輸入用完的錯誤、跑完了(try: input() except: 預設值)就不是在等
    e = res['error']
    wait = bool(e) and (e['type'] == 'PylWait' or (e['type'] == 'PylStop' and e['n']))
    res.update(waiting=_pyl['waiting'] if wait else 0, prompt=_pyl['prompt'] if wait else '', lines=_pyl['lines'], imgs=_pyl['imgs'])
    _pyl['eof'] = None
    return json.dumps(res)
`,n;try{importScripts(e+`pyodide.js`),n=loadPyodide({indexURL:e}).then(e=>(e.globals.set(`_pyl_src`,t),e.runPython(`exec(compile(_pyl_src, '<pyl>', 'exec'), globals())`),e))}catch(e){n=Promise.reject(e)}n.then(()=>postMessage({type:`ready`}),e=>postMessage({type:`fatal`,error:String(e&&e.message||e)}));function r(e){let t=[],n=Date.now(),r=0,i=!1,a=()=>{t.length&&(postMessage({type:`out`,id:e,text:t.join(`
`)}),t=[]),n=Date.now()};return{push:e=>{i||(r+=e.length+1,r>2e5?(i=!0,t.push(`……(輸出太多,後面省略)`),a()):(t.push(e),(t.length>=200||Date.now()-n>80)&&a()))},flush:a}}async function i(e){let t=await n;if(e.type===`load`){try{await t.loadPackagesFromImports(e.code||``)}catch{}return}if(e.type!==`run`||a.delete(e.id))return;try{await t.loadPackagesFromImports(e.code)}catch{}if(a.delete(e.id))return;postMessage({type:`started`,id:e.id});let i=r(e.id);t.setStdout({batched:i.push}),t.setStderr({batched:i.push});let o;try{let n=t.globals.get(`_pyl_run`);o=JSON.parse(n(e.code,t.toPy(e.stdin||[]),e.tests&&e.tests.length?JSON.stringify(e.tests):``,e.maxLines,e.seed==null?void 0:e.seed)),n.destroy()}catch(e){o={error:{type:`InternalError`,msg:``,text:String(e&&e.message||e),line:null},tests:null,waiting:0,imgs:[]}}i.flush(),postMessage({type:`done`,id:e.id,result:o})}let a=/* @__PURE__ */ new Set,o=Promise.resolve();onmessage=e=>{e.data.type===`cancel`?a.add(e.data.id):o=o.then(()=>i(e.data)).catch(()=>{})}})();