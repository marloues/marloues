"""macOS AX inspection for the real Codex window; requires OS user consent.

This operates the installed app. It does not replay a copy of its frontend.
Paths in press/set requests must come from a recent tree snapshot.
"""
import argparse
import ctypes as c
import json

cf = c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
ax = c.CDLL('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')


def bind(lib, name, restype, args):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = restype, args
    return fn


ptr, integer = c.c_void_p, c.c_long
string_new = bind(cf, 'CFStringCreateWithCString', ptr, [ptr, c.c_char_p, c.c_uint32])
string_get = bind(cf, 'CFStringGetCString', c.c_bool, [ptr, c.c_char_p, integer, c.c_uint32])
string_len = bind(cf, 'CFStringGetLength', integer, [ptr])
type_id = bind(cf, 'CFGetTypeID', c.c_ulong, [ptr])
release = bind(cf, 'CFRelease', None, [ptr])
array_count = bind(cf, 'CFArrayGetCount', integer, [ptr])
array_get = bind(cf, 'CFArrayGetValueAtIndex', ptr, [ptr, integer])
number_get = bind(cf, 'CFNumberGetValue', c.c_bool, [ptr, c.c_int, ptr])
boolean_get = bind(cf, 'CFBooleanGetValue', c.c_bool, [ptr])
attribute_copy = bind(ax, 'AXUIElementCopyAttributeValue', c.c_int, [ptr, ptr, c.POINTER(ptr)])
attribute_set = bind(ax, 'AXUIElementSetAttributeValue', c.c_int, [ptr, ptr, ptr])
actions_copy = bind(ax, 'AXUIElementCopyActionNames', c.c_int, [ptr, c.POINTER(ptr)])
action_do = bind(ax, 'AXUIElementPerformAction', c.c_int, [ptr, ptr])
application = bind(ax, 'AXUIElementCreateApplication', ptr, [c.c_int])
trusted = bind(ax, 'AXIsProcessTrusted', c.c_bool, [])
axvalue_get = bind(ax, 'AXValueGetValue', c.c_bool, [ptr, c.c_int, ptr])
axvalue_type = bind(ax, 'AXValueGetType', c.c_int, [ptr])
types = {name: bind(lib, name + 'GetTypeID', c.c_ulong, [])() for lib, name in [
    (cf, 'CFString'), (cf, 'CFArray'), (cf, 'CFNumber'), (cf, 'CFBoolean'), (ax, 'AXValue')]}
strings = {}


def key(text):
    if text not in strings:
        strings[text] = string_new(None, text.encode(), 0x08000100)
    return strings[text]


def attribute(element, name):
    out = ptr()
    return out.value if attribute_copy(element, key(name), c.byref(out)) == 0 else None


def value(ref):
    if not ref:
        return None
    kind = type_id(ref)
    if kind == types['CFString']:
        buf = c.create_string_buffer(string_len(ref) * 4 + 1)
        string_get(ref, buf, len(buf), 0x08000100)
        return buf.value.decode('utf8', errors='replace')
    if kind == types['CFBoolean']:
        return bool(boolean_get(ref))
    if kind == types['CFNumber']:
        number = c.c_double()
        number_get(ref, 13, c.byref(number))
        return number.value
    if kind == types['CFArray']:
        return [value(array_get(ref, i)) for i in range(array_count(ref))]
    if kind == types['AXValue']:
        pair = (c.c_double * 2)()
        if axvalue_type(ref) in (1, 2) and axvalue_get(ref, axvalue_type(ref), c.byref(pair)):
            return list(pair)
    return None


def read(element, name):
    ref = attribute(element, name)
    result = value(ref)
    if ref:
        release(ref)
    return result


def children(element, name='AXChildren'):
    ref = attribute(element, name)
    # Retain the array for the duration of this short process: its child refs
    # remain valid while walking and acting on the observed tree.
    return [array_get(ref, i) for i in range(array_count(ref))] if ref else []


parser = argparse.ArgumentParser()
parser.add_argument('operation', choices=['tree', 'press', 'set', 'actions'])
parser.add_argument('--pid', type=int, required=True)
parser.add_argument('--path', default='w0')
parser.add_argument('--title')
parser.add_argument('--description')
parser.add_argument('--role')
parser.add_argument('--max-depth', type=int, default=12)
parser.add_argument('--max-nodes', type=int, default=400)
parser.add_argument('--text-limit', type=int, default=300)
parser.add_argument('--value')
parser.add_argument('--value-type', choices=['string', 'boolean'], default='string')
parser.add_argument('--attribute', default='AXValue')
parser.add_argument('--action', default='AXPress')
parser.add_argument('--out')
args = parser.parse_args()
if not trusted():
    raise SystemExit('Accessibility consent is required; no UI action attempted')
root = application(args.pid)
segments = args.path.split('/')
element = root if args.path == 'app' else children(root, 'AXWindows')[int(segments[0][1:])]
if args.path != 'app':
    for segment in segments[1:]:
        element = children(element)[int(segment)]
if args.title or args.description:
    def find(current, path):
        if ((not args.title or read(current, 'AXTitle') == args.title)
                and (not args.description or read(current, 'AXDescription') == args.description)
                and (not args.role or read(current, 'AXRole') == args.role)):
            return current, path
        for i, child in enumerate(children(current)):
            found = find(child, path + '/' + str(i))
            if found:
                return found
    found = find(element, args.path)
    if not found:
        raise SystemExit('Observed control not found; no UI action attempted')
    element, args.path = found
if args.operation == 'press':
    output = {'path': args.path, 'title': read(element, 'AXTitle'), 'description': read(element, 'AXDescription'), 'error': action_do(element, key(args.action))}
elif args.operation == 'set':
    val = ptr.in_dll(cf, 'kCFBooleanTrue' if args.value == 'true' else 'kCFBooleanFalse').value if args.value_type == 'boolean' else key(args.value)
    output = {'error': attribute_set(element, key(args.attribute), val)}
elif args.operation == 'actions':
    ref = ptr()
    error = actions_copy(element, c.byref(ref))
    output = {'error': error, 'actions': value(ref.value)}
else:
    output = []

    def walk(current, path, depth):
        if len(output) >= args.max_nodes:
            return
        node = {'path': path}
        for name in ['AXRole', 'AXTitle', 'AXDescription', 'AXValue', 'AXIdentifier', 'AXEnabled', 'AXExpanded', 'AXPosition', 'AXSize']:
            result = read(current, name)
            if result is not None and result != '':
                node[name[2:]] = result[:args.text_limit] if isinstance(result, str) else result
        kids = children(current)
        node['children'] = len(kids)
        output.append(node)
        if depth < args.max_depth:
            for i, child in enumerate(kids):
                walk(child, path + '/' + str(i), depth + 1)

    walk(element, args.path, 0)
text = json.dumps(output, ensure_ascii=False, indent=2)
if args.out:
    with open(args.out, 'w') as stream:
        stream.write(text)
else:
    print(text)
