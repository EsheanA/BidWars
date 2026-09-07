function LoginForm({handleSubmit, username, setUsername, password, setPassword}){
    return(
        <form className = "login" onSubmit={handleSubmit}>
            <h2>Login</h2>
            <input placeholder="Username" value={username} onChange={e =>
                setUsername(e.target.value)} />
            <input type="password" placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} />
            <button type="submit">Login</button>
        </form>
    )
}
export default LoginForm

