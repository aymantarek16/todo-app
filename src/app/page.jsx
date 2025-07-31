/* eslint-disable react/react-in-jsx-scope */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil,
  CheckCircle,
  Circle,
  Trash2,
  Plus,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  doc,
  getDoc,
  setDoc,
} from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";

// eslint-disable-next-line react/prop-types
function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </li>
  );
}

export default function TodoPage() {
  // ==============================
  // 👤 Auth UI (Login & Sign Up)
  // ==============================

  // States to manage user auth and form data
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // Can be "login" or "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // 🔁 Refs & State setup
  const inputRef = useRef(null);
  // const [isClient, setIsClient] = useState(false);
  const [task, setTask] = useState("");
  const [tasks, setTasks] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const [editedTask, setEditedTask] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [reminderTime, setReminderTime] = useState("");
  const [timeLeft, setTimeLeft] = useState({});
  const [activeReminderMenu, setActiveReminderMenu] = useState(null);
  const [timeoutIds, setTimeoutIds] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const dropdownRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user); // Set user state when authenticated
      } else {
        setUser(null);
      }
      setInitialLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Upload Tasks From FireStore
  useEffect(() => {
    const fetchTasks = async () => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setTasks(data.tasks || []);
        }
      }
    };

    fetchTasks();
  }, [user]);

  // 🕵️‍♂️ Detect dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveReminderMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 🕒 Update time left for reminders every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const updated = {};

      tasks.forEach((t, i) => {
        if (t.reminderAt && t.reminderAt > now) {
          const diff = t.reminderAt - now;
          const minutes = Math.floor(diff / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          const hours = Math.floor(minutes / 60);
          const mins = minutes % 60;

          updated[i] = `${String(hours).padStart(2, "0")}:${String(
            mins
          ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        }
      });

      setTimeLeft(updated);
    }, 1000);

    return () => clearInterval(interval);
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  // 📝 Save tasks to Firestore whenever they change
  useEffect(() => {
    const saveTasks = async () => {
      if (user) {
        try {
          await setDoc(doc(db, "users", user.uid), {
            tasks,
          });
        } catch (err) {
          console.error("Error saving tasks:", err);
        }
      }
    };

    saveTasks();
  }, [tasks]);

  // Allow Notifications on Browser
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  // Handle Auth Login and Sign Up
  const handleAuth = async () => {
    setLoading(true);

    try {
      if (authMode === "login") {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        const userData = userCredential.user;

        // ⏳ Simulation delay
        await new Promise((res) => setTimeout(res, 700));

        setUser(userData);
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const userData = userCredential.user;

        await setDoc(doc(db, "users", userData.uid), {
          tasks: [],
        });

        setUser(userData);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔔 Notification function
  const notify = (taskText) => {
    const msg = new SpeechSynthesisUtterance();
    msg.text = `Hi, don't forget to: ${taskText}`;
    msg.lang = "en-US";
    window.speechSynthesis.speak(msg);

    if (Notification.permission === "granted") {
      new Notification("Task Reminder", {
        body: taskText,
        icon: "🔔",
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification("Task Reminder", {
            body: taskText,
            icon: "🔔",
          });
        }
      });
    }
  };

  // ➕ Add a new task
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!task.trim()) {
      alert("Please enter a task.");
      return;
    }

    const now = Date.now();
    const reminderAt = reminderTime
      ? now + parseInt(reminderTime) * 60 * 1000
      : null;

    const newTask = {
      id: crypto.randomUUID(), // unique ID
      text: task,
      completed: false,
      reminderAt,
    };

    setTasks((prev) => [newTask, ...prev]);
    setTask("");

    if (reminderAt) {
      const timeoutId = setTimeout(() => {
        notify(task);
      }, reminderAt - now);

      setTimeoutIds((prev) => ({
        ...prev,
        [newTask.id]: timeoutId,
      }));
    }

    setReminderTime("");
  };

  // ✅ Toggle task completion
  const toggleComplete = (index) => {
    setTasks((prev) =>
      prev.map((task, i) =>
        i === index ? { ...task, completed: !task.completed } : task
      )
    );
  };

  // ✏️ Open edit modal for a task
  const handleEdit = (index) => {
    setEditIndex(index);
    setEditedTask(tasks[index].text);
  };

  // 💡 Confirm edit and update task
  const confirmEdit = () => {
    setTasks((prev) =>
      prev.map((task, i) =>
        i === editIndex ? { ...task, text: editedTask } : task
      )
    );
    setEditIndex(null);
    setEditedTask("");
  };

  // 🗑️ Delete all tasks
  const deleteAll = () => {
    if (window.confirm("Are you sure you want to delete all tasks?")) {
      setTasks([]);
      localStorage.removeItem("tasks");
    }
    setSearchQuery(""); // Clear search query when deleting all tasks
  };

  // 🔍 Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks
      .filter((t) => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((t) => {
        if (filter === "active") return !t.completed;
        if (filter === "finished") return t.completed;
        return true;
      });
  }, [tasks, searchQuery, filter]);

  // 🔀 Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = tasks.findIndex((t, i) => i.toString() === active.id);
      const newIndex = tasks.findIndex((t, i) => i.toString() === over?.id);
      setTasks((tasks) => arrayMove(tasks, oldIndex, newIndex));
    }
  };

  return (
    <>
      {/* Loading Duration Refresh */}
      {initialLoading && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-green-950  z-50"
        >
          <motion.div
            className="relative w-16 h-16"
            animate={{
              rotate: 360,
            }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: 1.2,
            }}
          >
            <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-b-transparent border-l-white border-r-white" />
            <motion.div
              className="absolute inset-1 rounded-full bg-zinc-900"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </motion.div>
      )}

      {/* 🌀 Loading & Tasks & Auth Page */}
      {loading ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-green-950 bg-opacity-70 z-50"
        >
          <motion.div
            className="relative w-16 h-16"
            animate={{
              rotate: 360,
            }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: 1.2,
            }}
          >
            <div className="absolute inset-0 rounded-full border-4 border-t-transparent border-b-transparent border-l-white border-r-white" />
            <motion.div
              className="absolute inset-1 rounded-full bg-zinc-900"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </motion.div>
      ) : user ? (
        <div className="max-w-xl mx-auto mt-5 px-4 ">
          <h3 className="WelcomeBack text-xl text-center mb-2">
            Welcome Back |{" "}
            <span className="text-green-500">{user.email.split("@")[0]}</span>
          </h3>
          {/* 🧠 Title */}
          <h1 className="toDoListTitle text-2xl font-bold mb-2 text-center text-white">
            To Do List
          </h1>

          <p className="AllTitle text-sm text-zinc-400 mb-2 text-center">
            Total: <span className="text-green-500 bold">{tasks.length}</span> |
            Active:{" "}
            <span className="text-green-500">
              {tasks.filter((t) => !t.completed).length}
            </span>{" "}
            | Finished:{" "}
            <span className="text-green-500">
              {tasks.filter((t) => t.completed).length}
            </span>
          </p>

          {/*  📝 Search bar & Filtered Tasks */}
          <div className="flex gap-2">
            {/* 🔍 Search */}
            <div className="flex-1 items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-800 text-white outline-none"
              />
            </div>

            {/* Filtered tasks */}
            <div className="filterDrop flex justify-end mb-4">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-2 py-2 rounded-xl bg-zinc-700 text-white outline-none"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="finished">Finished</option>
              </select>
            </div>
          </div>

          {/* ✍️ Task Input Form */}
          <form
            onSubmit={handleAddTask}
            className="flex items-center gap-2 mb-4"
          >
            <input
              ref={inputRef}
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Add new task"
              className="inputTask flex-1 px-4 py-3 rounded-xl bg-zinc-800 text-white outline-none"
            />
            {/* ⏰ Select Reminder */}
            <select
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="px-3 py-3 rounded-xl h text-white outline-none bg-zinc-700"
            >
              <option value="">No Reminder</option>
              <option value="1">In 1 minutes</option>
              <option value="5">In 5 minutes</option>
              <option value="15">In 15 minutes</option>
              <option value="30">In 30 minutes</option>
              <option value="60">In 1 hour</option>
            </select>
            <motion.div
              whileTap={{ scale: 0.9 }}
              type="submit"
              onClick={handleAddTask}
              className="cursor-pointer bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl"
            >
              <Plus size={18} />
            </motion.div>
          </form>

          {/* 📭 Empty state or 📋 Task list */}
          {filteredTasks.length === 0 ? (
            <div className="text-center">
              <p className="text-zinc-400 text-lg">No tasks found.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredTasks.map((_, i) => i.toString())}
                strategy={verticalListSortingStrategy}
              >
                <ul className="tasks_list space-y-2 min-h-68 max-h-68 overflow-y-auto rounded-xl overflow-x-hidden">
                  <AnimatePresence>
                    {filteredTasks.map((task, i) => (
                      <SortableItem id={i.toString()} key={i}>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          layout
                          className="bg-zinc-800 text-white p-3 rounded-xl shadow-sm flex justify-between items-center"
                        >
                          {/* 📌 Task + Completion Toggle */}
                          <div className="flex items-center gap-3 flex-1">
                            <button
                              onClick={() => {
                                toggleComplete(i);
                              }}
                            >
                              {task.completed ? (
                                <CheckCircle className="text-green-400" />
                              ) : (
                                <Circle className="text-gray-400" />
                              )}
                            </button>
                            <span
                              className={`text-white ${
                                task.completed
                                  ? "line-through text-gray-400"
                                  : ""
                              }`}
                            >
                              {task.text}
                            </span>

                            <span
                              className={`text-white ${
                                task.completed
                                  ? "line-through text-gray-400"
                                  : ""
                              }`}
                            >
                              {task.reminderAt && !task.completed && (
                                <span className="ml-2 text-sm text-green-500">
                                  {timeLeft[i] || "00:00:00"}
                                </span>
                              )}

                              {task.reminderAt && !task.completed && (
                                <div className="relative inline-block ml-2">
                                  <button
                                    onClick={() =>
                                      setActiveReminderMenu(
                                        i === activeReminderMenu ? null : i
                                      )
                                    }
                                    className="text-blue-400 text-sm cursor-pointer"
                                  >
                                    🕒
                                  </button>

                                  {activeReminderMenu === i && (
                                    <div
                                      ref={dropdownRef}
                                      className="absolute bg-zinc-900 border border-zinc-700 rounded p-2 mt-1 space-y-1 px-3"
                                    >
                                      {[10, 15, 30, 60].map((min) => (
                                        <button
                                          key={min}
                                          className="cursor-pointer block text-white text-xs hover:text-green-400"
                                          onClick={() => {
                                            const updatedTasks = [...tasks];
                                            // Calculate new reminder time
                                            const newReminderAt =
                                              Date.now() + min * 60 * 1000;

                                            updatedTasks[i].reminderAt =
                                              newReminderAt;
                                            setTasks(updatedTasks);
                                            setActiveReminderMenu(null);

                                            // Clear any existing timeout for this task
                                            const taskId = tasks[i].id;
                                            if (timeoutIds[taskId]) {
                                              clearTimeout(timeoutIds[taskId]);
                                              setTimeoutIds((prev) => {
                                                const updated = { ...prev };
                                                delete updated[taskId];
                                                return updated;
                                              });
                                            }

                                            // Build a new timeout
                                            const newTimeoutId = setTimeout(
                                              () => {
                                                notify(updatedTasks[i].text);
                                              },
                                              newReminderAt - Date.now()
                                            );

                                            setTimeoutIds((prev) => ({
                                              ...prev,
                                              [taskId]: newTimeoutId,
                                            }));
                                          }}
                                        >
                                          {min}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </span>
                          </div>

                          {/* 🛠️ Edit & Delete Buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEdit(i)}
                              className="cursor-pointer bg-sky-600 hover:bg-sky-700 px-4 py-2 rounded-xl"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => {
                                const taskToDelete = tasks[i]; //
                                const taskId = taskToDelete.id;

                                if (timeoutIds[taskId]) {
                                  clearTimeout(timeoutIds[taskId]);
                                  setTimeoutIds((prev) => {
                                    const updated = { ...prev };
                                    delete updated[taskId];
                                    return updated;
                                  });
                                }

                                setTasks((prev) =>
                                  prev.filter((_, index) => index !== i)
                                );
                              }}
                              className="bg-red-900 hover:bg-red-700 cursor-pointer text-white px-4 py-2 rounded-xl"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        </motion.div>
                      </SortableItem>
                    ))}
                  </AnimatePresence>
                </ul>
              </SortableContext>
            </DndContext>
          )}
          {/* 🧨 Delete All Button */}
          {tasks.length > 0 && (
            <motion.div
              whileTap={{ scale: 0.95 }}
              onClick={deleteAll}
              className="DeleteAll_btn cursor-pointer mt-4 bg-red-700 hover:bg-red-800 text-white px-4 py-2 rounded-xl block mx-auto w-1/3 text-center"
            >
              Delete All Tasks
            </motion.div>
          )}
          <button
            onClick={async () => {
              await signOut(auth);
              setUser(null);
              setTasks([]);
            }}
            className="logout_Btn
                cursor-pointer bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl absolute bottom-4 right-4 z-50 flex items-center gap-2
                transition-colors duration-300 ease-in-out
                "
          >
            Logout
          </button>
          {/* ✨ Edit Modal with Animation */}
          <AnimatePresence>
            {editIndex !== null && (
              <motion.div
                key="modal"
                initial={{ opacity: 0, scale: 0.8, y: -100 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -100 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 bg-zinc-800 bg-opacity-80 flex items-center justify-center z-50"
              >
                <div className="bg-zinc-900 text-white p-6 rounded-xl w-96 shadow-xl">
                  <h2 className="text-xl font-bold mb-4 border-b border-zinc-700 pb-2 text-center">
                    Edit Task
                  </h2>
                  <input
                    type="text"
                    value={editedTask}
                    onChange={(e) => setEditedTask(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-800 text-white outline-none"
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => setEditIndex(null)}
                      className="cursor-pointer bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmEdit}
                      className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="flex flex-col items-center justify-center min-h-screen text-white bg-gradient-to-br from-black via-zinc-900 to-green-950"
        >
          {/* Title changes based on auth mode */}
          <h2 className="text-2xl font-bold mb-4">
            {authMode === "login" ? "Login" : "Create Account"}
          </h2>

          {/* Auth Form Container */}
          <div className="bg-zinc-800 p-6 rounded-xl shadow-xl w-80 space-y-4">
            {/* Email Input Field */}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-700 text-white outline-none"
            />

            {/* Password Input Field with Toggle */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-zinc-700 text-white outline-none"
              />
              <div
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-4 transform -translate-y-1/2 cursor-pointer text-zinc-400"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </div>
            </div>

            {/* Submit Button (Login or Sign Up) */}
            <button
              onClick={handleAuth}
              className="w-full cursor-pointer bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl"
            >
              {authMode === "login" ? "Login" : "Sign Up"}
            </button>

            {/* Switch between Login and Sign Up */}
            <p
              onClick={() =>
                setAuthMode(authMode === "login" ? "signup" : "login")
              }
              className="text-sm text-blue-400 text-center cursor-pointer"
            >
              {authMode === "login"
                ? "Don't have an account? Sign up"
                : "Already have an account? Log in"}
            </p>
          </div>
        </motion.div>
      )}
    </>
  );
}
