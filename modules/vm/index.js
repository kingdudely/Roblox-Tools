import Upvalue from "./upvalue.js";
const LUA_MULTRET = -1;

function getLuauType(object) {
	switch (typeof object) {
		case "function": return "function";
		case "bigint":
		case "number": return "number";
		case "symbol": return "userdata";
		case "object": return "table";
		case "boolean": return "boolean";
		case "string": return "string";
		case "undefined": return "nil";
		default: throw new Error("Unknown type");
	};
}

export default class VM {
	globals = Object.create(null);

	// replace module with protoList
	newclosure(protoList, protoIndex, upvals = []) {
		// async so that we can implement task.wait
		const proto = protoList[protoIndex];
		const { numparams, maxstacksize, protos, code, debugcode: debugopcodes, k: constants, instructionlineinfo } = proto; // debugname

		class LuauError extends Error {
			constructor(message, pc) {
				const lineNumber = instructionlineinfo?.[pc] ?? -1;
				super(`:${lineNumber}: ${message}`);

				this.name = 'LuauError';
				this.lineNumber = lineNumber;
			}
		};

		return async (...args) => {
			const varargs = []; // { len: 0, list: [] };

			const stack = new Array(maxstacksize); // .fill(undefined), length: Math.min(numparams, args.length)
			for (let i = 0; i < numparams && i < args.length; i++) {
				stack[i] = args[i];
			}

			if (numparams < args.length) {
				const start = numparams;
				const len = args.length - numparams;
				// varargs.len = len;
				for (let i = 0; i < len; i++) varargs[i] = args[start + i]; // varargs.list[i]
			}

			// const debugging = { pc: 0, name: "NONE" };
			const open_upvalues = new Map();
			const generalized_iterators = new WeakMap(); // Map

			let handlingBreak = false;
			let top = -1, pc = 0;
			let inst, op;

			function getUpvalues(nups, duplicate) {
				const upvalues = Array.from({ length: nups }, () => {
					const { A: upvalueType, B: upvalueIndex } = code[pc++]; // pseudo = 

					switch (upvalueType) {
						case 0: return new Upvalue("value", stack[upvalueIndex]); // value

						case 1: { // reference
							if (duplicate) {
								console.warn("Unexpected upvalue reference in duplicate closure");
								break;
							};

							// prev
							const upvalue = open_upvalues.get(upvalueIndex) ?? new Upvalue(upvalueIndex, undefined, stack);
							open_upvalues.set(upvalueIndex, upvalue);
							return upvalue;
						};

						case 2: return upvals[upvalueIndex]; // upvalue
					}
				});

				return upvalues;
			}

			while (true) { // alive
				if (!handlingBreak) {
					inst = code[pc];
					if (!inst) throw new RangeError(`PC out of range: ${pc}`);
					op = inst.opcode;
				};

				handlingBreak = false;

				const { aux, opname, A, B, C, D, E, K, KC, K0, K1, K2, KN } = inst;

				/*
				debugging.pc = pc;
				debugging.top = top;
				debugging.name = opname;
				*/

				pc++;

				switch (op) { // opname
					case 0: break; // NOP

					case 1: { // BREAK
						// pc -= 1
						op = debugopcodes[--pc];
						handlingBreak = true;
						break;
					}

					case 2: stack[A] = undefined; break; // LOADNIL

					case 3: { // LOADB
						stack[A] = B === 1;
						pc += C;
						break;
					}

					case 4: stack[A] = D; break; // LOADN
					case 5: stack[A] = K; break; // LOADK
					case 6: stack[A] = stack[B]; break; // MOVE

					case 7: { // GETGLOBAL
						stack[A] = this.globals[K]; // extensions[K] ||
						pc++;
						break;
					}

					case 8: { // SETGLOBAL
						this.globals[K] = stack[A];
						pc++;
						break;
					}

					case 9: stack[A] = upvals[B].get(); break; // GETUPVAL
					case 10: upvals[B].set(stack[A]); break; // SETUPVAL

					case 11: { // CLOSEUPVALS
						// convert any open upvalues with index >= inst.A into closed upvalues
						for (const [idx, uv] of open_upvalues) {
							if (uv.index >= A) {
								uv.close();
								open_upvalues.delete(idx);
							};
						};

						break;
					}

					case 12: { // GETIMPORT
						const importWrap = this.globals[K0]; // extensions[k0] ||
						switch (KC) {
							case 1: stack[A] = importWrap; break;
							case 2: stack[A] = importWrap[K1]; break;
							case 3: stack[A] = importWrap[K1][K2]; break;
						};

						pc++;
						break;

						/*
						if (useImportConstants) {
							stack[A] = K;
						} else {
							// count = KC
							const importWrap = this.globals[K0]; // extensions[k0] ||
							switch (KC) {
								case 1: stack[A] = importWrap; break;
								case 2: stack[A] = importWrap[K1]; break;
								case 3: stack[A] = importWrap[K1][K2]; break;
							};
						};
						*/
					}

					case 13: stack[A] = stack[B][stack[C]]; break; // GETTABLE
					case 14: stack[B][stack[C]] = stack[A]; break; // SETTABLE

					case 15: { // GETTABLEKS
						// index = K
						stack[A] = stack[B][K];
						pc++;
						break;
					}

					case 16: { // SETTABLEKS
						// index = K
						stack[B][K] = stack[A];
						pc++;
						break;
					}

					/*
					Luau table sequence is 1-based; incoming instruction used inst.C + 1 previously
					keep the language semantics (table[1] maps to obj[1] in JS). We assume sequences stored as JS arrays
					*/
					case 17: stack[A] = stack[B][C]; break; // GETTABLEN
					case 18: stack[B][C] = stack[A]; break; // SETTABLEN

					case 19: { // NEWCLOSURE
						// protos array holds indices into protoList; inst.D is the proto index
						const newProtoIndex = protos[D];
						stack[A] = this.newclosure(protoList, newProtoIndex, getUpvalues(protoList[newProtoIndex].nups, false));
						break;
					}

					// (TODO, make NAMECALL and CALL work with func(self, ...args) and func.apply(self, args))

					case 20: { // NAMECALL
						const obj = stack[B];
						const method = obj[K];
						stack[A] = method;
						stack[A + 1] = obj;

						pc++;
						break;
					}

					case 21: { // CALL
						const argumentAmount = (B === 0) ? (top - A) : (B - 1);
						const func = stack[A];

						if (typeof func !== "function") {
							throw new LuauError(`attempt to call a ${getLuauType(func)} value`, pc);
						}

						const args = stack.slice(A + 1, A + 1 + argumentAmount);
						let results = await func(...args); // returned
						results = Array.isArray(results) ? results : [results]; // normalize return values

						let resultAmount = results.length;
						if (C === 0) {
							top = A + resultAmount - 1;
						} else {
							resultAmount = C - 1;
						};

						for (let i = 0; i < resultAmount; i++) {
							stack[A + i] = results[i];
						};

						break;
					};

					case 22: { // RETURN
						let resultAmount = B - 1;
						if (resultAmount === LUA_MULTRET) resultAmount = top - A + 1;
						return stack.slice(A, A + resultAmount);
					};

					case 23: pc += D; break; // JUMP
					case 24: pc += D; break; // JUMPBACK
					case 25: pc += (stack[A]) ? D : 0; break; // JUMPIF // if (stack[A]) pc += D;
					case 26: pc += (!stack[A]) ? D : 0; break; // JUMPIFNOT // if (!stack[A]) pc += D;
					case 27: pc += (stack[A] === stack[aux]) ? D : 1; break; // JUMPIFEQ
					case 28: pc += (stack[A] <= stack[aux]) ? D : 1; break; // JUMPIFLE
					case 29: pc += (stack[A] < stack[aux]) ? D : 1; break; // JUMPIFLT
					case 30: pc += (stack[A] !== stack[aux]) ? D : 1; break; // JUMPIFNOTEQ
					case 31: pc += (stack[A] > stack[aux]) ? D : 1; break; // JUMPIFNOTLE // <= 1 ? D
					case 32: pc += (stack[A] >= stack[aux]) ? D : 1; break; // JUMPIFNOTLT // < 1 ? D

					case 33: stack[A] = stack[B] + stack[C]; break; // ADD
					case 34: stack[A] = stack[B] - stack[C]; break; // SUB
					case 35: stack[A] = stack[B] * stack[C]; break; // MUL
					case 36: stack[A] = stack[B] / stack[C]; break; // DIV
					case 37: stack[A] = stack[B] % stack[C]; break; // MOD
					case 38: stack[A] = stack[B] ** stack[C]; break; // POW

					case 39: stack[A] = stack[B] + K; break; // ADDK
					case 40: stack[A] = stack[B] - K; break; // SUBK
					case 41: stack[A] = stack[B] * K; break; // MULK
					case 42: stack[A] = stack[B] / K; break; // DIVK
					case 43: stack[A] = stack[B] % K; break; // MODK
					case 44: stack[A] = stack[B] ** K; break; // POWK

					// || false
					case 45: stack[A] = stack[B] && stack[C]; break; // AND // stack[B] ? stack[C] || false : false // stack[A] = value ? (stack[C] || false) : value;
					case 46: stack[A] = stack[B] || stack[C]; break; // OR // value ? value : (stack[C] || false);
					case 47: stack[A] = stack[B] && K; break; // ANDK
					case 48: stack[A] = stack[B] || K; break; // ORK // value ? value : (inst.K || false);


					/*
					// fallback
					let s = stack[B];
					for (let i = B + 1; i <= C; i++) s += stack[i];
					stack[A] = s;
					*/
					case 49: stack[A] = stack.slice(B, C + 1).join(""); break; // CONCAT
					case 50: stack[A] = !stack[B]; break; // NOT
					case 51: stack[A] = -stack[B]; break; // MINUS
					case 52: stack[A] = stack[B].length; break; // LENGTH // ?.length

					case 53: { // NEWTABLE
						stack[A] = Object.create(null); // new Array(aux); (todo)
						pc++;
						break;
					}

					case 54: { // DUPTABLE
						// template = K
						const serialized = Object.create(null); // {}
						for (const ID of Object.values(K)) { // id of K
							serialized[constants[ID]] = undefined; // null
						};

						stack[A] = serialized;
						break;
					}

					case 55: { // SETLIST
						let count = C - 1;
						if (count === LUA_MULTRET) { // (C - 1) === LUA_MULTRET
							count = top - B + 1;
						};

						// table_move(stack, B, B + c - 1, inst.aux, stack[A])
						const list = stack[A];
						for (let i = 0; i < count; i++) {
							list[aux + i] = stack[B + i];
						};

						pc++;
						break;
					}

					case 56: { // FORNPREP
						const limit = stack[A] = Number(stack[A]);
						if (Number.isNaN(limit)) throw new LuauError("invalid 'for' limit (number expected)", pc);

						const step = stack[A + 1] = Number(stack[A + 1]);
						if (Number.isNaN(step)) throw new LuauError("invalid 'for' step (number expected)", pc);

						const index = stack[A + 2] = Number(stack[A + 2]);
						if (Number.isNaN(index)) throw new LuauError("invalid 'for' index (number expected)", pc);

						if (step > 0) {
							if (index > limit) pc += D;
						} else if (limit > index) pc += D;

						/*
						if (Math.sign(step) * (index - limit) > 0) pc += D;

						if (step > 0) {
							if (!(index <= limit)) pc += inst.D;
						} else {
							if (!(limit <= index)) pc += inst.D;
						}
						*/

						break;
					}

					case 57: { // FORNLOOP
						const limit = stack[A];
						const step = stack[A + 1];
						const index = stack[A + 2] += step;
						/*
						const index = stack[A + 2] + step;
						stack[A + 2] = index;
						*/

						if (step > 0) {
							if (index <= limit) pc += D;
						} else if (limit <= index) pc += D;

						break;
					}

					case 58: { // FORGLOOP
						// res = K
						top = A + 6;

						const it = stack[A];

						if (typeof it === "function") { // luau_settings.generalizedIteration === false 
							// Traditional iterator
							let vals = await it(stack[A + 1], stack[A + 2]);

							// Normalize iterator return:
							// - undefined/null  -> loop termination
							// - non-array value  -> treat as single value
							// - array            -> multi-return as-is
							if (vals == null) {
								for (let i = 0; i < K; i++) stack[A + 3 + i] = undefined;
								pc++; // exit loop
							} else {
								if (!Array.isArray(vals)) vals = [vals];

								for (let i = 0; i < K; i++) {
									stack[A + 3 + i] = vals[i];
								}

								if (stack[A + 3] != null) {
									stack[A + 2] = stack[A + 3];
									pc += D;
								} else {
									pc++;
								};
							};
						} else {
							const gen =
								generalized_iterators.get(inst) ??
								(function* () { // default
									if (typeof it === "object") {
										for (const entry of Object.entries(it)) {
											yield entry;
										}
									}
								})();

							if (!gen) throw new TypeError("invalid iterator for forgloop");
							generalized_iterators.set(inst, gen);

							const { value, done } = await gen.next();

							if (!done && value != null) {
								let out = value;
								if (!Array.isArray(out)) out = [out];

								for (let i = 0; i < K; i++) stack[A + 3 + i] = out[i];
								stack[A + 2] = stack[A + 3];
								pc += D;
							} else {
								pc++; // exit loop
							}
						};

						break;
					}

					case 59: { // FORGPREP_INEXT
						if (typeof stack[A] !== "function") {
							throw new LuauError(`attempt to iterate over a ${getLuauType(stack[A])} value`, pc);
						};

						pc += D;
						break;
					}

					case 60: pc++; break; // FASTCALL3

					case 61: { // FORGPREP_NEXT
						if (typeof stack[A] !== "function") {
							throw new LuauError(`attempt to iterate over a ${getLuauType(stack[A])} value`, pc);
						};

						pc += D;
						break;
					}

					case 63: { // GETVARARGS
						let count = B - 1;
						if (count === LUA_MULTRET) { // (B - 1) === LUA_MULTRET
							count = varargs.length; // varargs.len;
							top = A + count - 1;
						};

						for (let i = 0; i < count; i++) {
							stack[A + i] = varargs[i]; // varargs.list[i]
						};

						break;
					}

					case 64: { // DUPCLOSURE
						const { Closure: originalClosure, Index: protoIndex, Upvalues: originalUpvalues } = K;
						const { nups } = protoList[protoIndex];
						const temporaryUpvalues = getUpvalues(nups, true);

						let reused = false;
						if (originalClosure != null && originalUpvalues != null) {
							let same = true;
							for (let i = 0; i < nups; i++) {
								const ou = originalUpvalues[i];
								const tu = temporaryUpvalues[i];

								if (ou.get() !== tu.get()) {
									same = false;
									break;
								}
							}

							if (same) {
								stack[A] = originalClosure;
								reused = true;
							}
						}

						if (!reused) {
							K.Upvalues = temporaryUpvalues;
							K.Closure = this.newclosure(protoList, protoIndex, temporaryUpvalues);
							stack[A] = K.Closure;
						}

						break;
					}

					case 65: break; // PREPVARARGS // no-op?

					case 66: { // LOADKX
						stack[A] = K;
						pc++;
						break;
					}

					case 67: pc += E; break; // JUMPX

					/*
					inst.E ||= 0;
					inst.E++;
					*/
					case 69: inst.E = (E || 0) + 1; break; // COVERAGE
					case 70: throw new Error("encountered unhandled CAPTURE"); // CAPTURE

					case 71: stack[A] = K - stack[C]; break; // SUBRK
					case 72: stack[A] = K / stack[C]; break; // DIVRK

					case 73: break; // FASTCALL1
					case 74: pc++; break; // FASTCALL2
					case 75: pc++; break; // FASTCALL2K

					case 76: { // FORGPREP // luau_settings.generalizedIteration
						const iterator = stack[A];
						let gen;
						if (typeof iterator === "object") {
							gen = await Object.entries(iterator)[Symbol.iterator]();
						} else if (typeof iterator?.next === "function") { // assume it is a generator function
							gen = iterator;
						} else {
							throw new TypeError("Unsupported generalized iterator: must be generator or iterable")
						}

						generalized_iterators.set(inst, gen);

						pc += D;
						break;
					}

					case 77: pc += ((stack[A] == null) !== KN) ? D : 1; break; // JUMPXEQKNIL

					case 78: { // JUMPXEQKB
						const ra = stack[A];
						pc += ((typeof ra === "boolean" && ra === K) !== KN) ? D : 1;
						break;
					}

					case 79: pc += ((stack[A] === K) !== KN) ? D : 1; break; // JUMPXEQKN
					case 80: pc += ((stack[A] === K) !== KN) ? D : 1; break; // JUMPXEQKS

					case 81: stack[A] = Math.floor(stack[B] / stack[C]); break; // IDIV
					case 82: stack[A] = Math.floor(stack[B] / K); break; // IDIVK

					default: throw new TypeError("Unsupported Opcode: " + opname + " op: " + op);
				}
			} // end while
		}
	}
}
